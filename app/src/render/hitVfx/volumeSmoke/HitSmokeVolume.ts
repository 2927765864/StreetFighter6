// Ported from CircleSmokeVFX HitSmokeVolume.js — TSL graph kept as-is.
// @ts-nocheck
import * as THREE from 'three/webgpu';
import {
	Fn, If, Loop, float, int, vec3, vec4, uvec3, uint, uniform, instanceIndex,
	texture3D, textureStore, storageTexture, max, min, mix, exp, length, cross, dot,
	abs, atan, cos, sin, clamp, step,
	screenCoordinate, interleavedGradientNoise, frameId, fract, floor,
	smoothstep, cameraPosition, modelWorldMatrixInverse,
	atomicMax, atomicStore, floatBitsToUint, instancedArray,
} from 'three/tsl';
import {
	MAX_STRANDS,
	buildStrandSet,
	enforceMinStrandRadii,
	minStrandRadiusUVW,
	packStrandsToBuffer,
	strandDensMulForThickness,
} from './strandSeed';

/** seedShape string → shader id */
export const SEED_SHAPE_ID = Object.freeze( {
	sphere: 0,
	disk: 1,
	ring: 2,
	column: 3,
	arc: 4,
	arrow: 5,
} );
import { snoise, snoiseVec3 } from 'three/addons/tsl/math/curlNoise.js';
import {
	createStorage3D, GRID, CELL_COUNT, PRESSURE_ITERATIONS, VOLUME_WORLD_SIZE,
} from './createStorage3D';
import { computeSeedOrientation } from './seedOrientation';
import { resolveVolumeSmokeImpulseFromParams } from './impulseMode';
import {
	volumeSmokeFadeMul,
	volumeSmokeShouldBeginFade,
} from './smokeFade';

const TEXEL = 1 / GRID;

/**
 * One pooled hit-smoke volume: official webgpu_volume_fire fluid + one-shot Gaussian splat.
 * Curl: Official-Precompute (storage curlNoiseTex, RepeatWrapping set once before compute).
 */
export class HitSmokeVolume {

	/**
	 * @param {THREE.WebGPURenderer} renderer
	 * @param {object} [options]
	 */
	constructor( renderer, options = {} ) {

		this.renderer = renderer;
		this.active = false;
		this.age = 0;
		this.simAccumulator = 0;
		this.simulationTime = 0;
		this.curlMode = 'Official-Precompute';
		this._curlReady = false;
		/** @type {'alive'|'fading'} */
		this.lifePhase = 'alive';
		this.fadeAge = 0;
		this.peakDensity = 0;
		this._densitySampleReady = false;
		this._densityReadPending = false;
		this._densityFrame = 0;
		this._splatDone = false;

		this.params = {
			simulate: true,
			simSpeed: 1.0,
			pressureIterations: PRESSURE_ITERATIONS,
			fixedSubstepsHz: 120,
			smokeLifespan: 1.2,
			tempLifespan: 0.8,
			endCondition: 'lifespan',
			fadeOutSec: 0.3,
			fadeCurve: 'easeOut',
			buoyancy: 2.0,
			weight: 0.15,
			turbulence: 2.5,
			turbulenceDecay: 0.1,
			turbFrequency: 8.0,
			/** 0 = free curl; 1 = align turbulence to turbulenceDir. */
			turbulenceBias: 0.0,
			turbulenceDir: { x: 0, y: 1, z: 0 },
			velDamping: 0.35,
			/** Initial smoke splat radius in world meters (independent of box size). */
			hitRadius: 0.36,
			/** sphere | disk | ring | arc | arrow | column — overall size still from hitRadius. */
			seedShape: 'sphere',
			/** Disk/ring/arc/arrow thickness as a fraction of hitRadius. */
			shapeThickness: 0.28,
			/** Ring/arc midline radius as a fraction of hitRadius. */
			ringRadiusRatio: 0.65,
			/** Ring/arc tube width / arrow arm width as a fraction of hitRadius. */
			ringWidth: 0.22,
			/** Arc angular span in degrees (parenthesis / ring segment). */
			arcAngle: 140,
			/** Arrow (">") interior angle between arms in degrees. */
			arrowAngle: 70,
			/** Arrow arm length as a fraction of hitRadius. */
			arrowLength: 1.0,
			/** Column half-height as a fraction of hitRadius. */
			columnHeight: 1.4,
			/** Extra seed tilt in degrees (XYZ), applied after aligning +Y to hit dir. */
			seedRotation: { x: 0, y: 0, z: 0 },
			/** Seed center offset in volume UVW (0 = box center). */
			seedOffset: { x: 0, y: 0, z: 0 },
			spawnSeed: 0,
			strandMode: false,
			strandCount: 8,
			strandLength: 0.85,
			strandThickness: 0.18,
			strandSpacing: 0.22,
			strandTwistDeg: 0,
			strandAngleJitterDeg: 18,
			strandBend: 0.55,
			strandEdgeSoftness: 0.65,
			strandGapFill: 0.12,
			strandRandomAmount: 1,
			hitImpulse: 14.0,
			hitDensity: 4.0,
			hitTemperature: 3.0,
			/** 'direction' | 'scatter' — see impulseMode.ts / consensus. */
			impulseMode: 'direction',
			impulseDirSource: 'hit',
			impulseDir: { x: 0, y: 1, z: 0 },
			showImpulseDir: true,
			/** Direction mode: 0 = axis push; 1 = radial. Scatter forces 1 at arm time. */
			impulseRadial: 0.2,
			/** Spin around impulse axis — more divergence-free, survives projection better. */
			impulseSwirl: 1.2,
			/** Keep applying hit force for this many sim substeps after spawn. */
			impulseSubsteps: 8,
			/** Multiply force by box size so UVW travel stays similar when domain grows. */
			impulseScaleWithBox: true,
			/** Render-only velocity warp (too high + huge vel → white flash). */
			velDisplayWarp: 0.04,
			densityStop: 0.02,
			volumeSize: VOLUME_WORLD_SIZE.x,
			/**
			 * Unrestricted = open domain: no soft walls, outflow-friendly faces,
			 * and a larger world AABB so smoke can keep spreading outward in world space.
			 * (Still a finite voxel grid — not infinite continuum.)
			 */
			unrestricted: false,
			/** World cube size used while unrestricted (meters). */
			unrestrictedVolumeSize: 12,
			shadowAbsorption: 2.0,
			shadowAmbient: 0.5,
			powderStrength: 0.4,
			multiScattering: 0.5,
			phaseAsymmetry: 0.0,
			smokeColor: '#b0b0b0',
			densityGain: 1.0,
			raymarchSteps: 24,
			...options.params,
		};

		this.maxLife = this.params.smokeLifespan;

		this.velTexA = createStorage3D( 'velocity A' );
		this.velTexB = createStorage3D( 'velocity B' );
		this.dyeTexA = createStorage3D( 'dye A' );
		this.dyeTexB = createStorage3D( 'dye B' );
		this.divTex = createStorage3D( 'divergence' );
		this.pressTexA = createStorage3D( 'pressure A' );
		this.pressTexB = createStorage3D( 'pressure B' );
		this.curlNoiseTex = createStorage3D( 'curlNoise' );
		// Official: Repeat wrap once at init, before first compute (#31886)
		this.curlNoiseTex.wrapS = THREE.RepeatWrapping;
		this.curlNoiseTex.wrapT = THREE.RepeatWrapping;
		this.curlNoiseTex.wrapR = THREE.RepeatWrapping;

		this.dyeTexNode = texture3D( this.dyeTexA );
		this.dyeTexWriteNode = storageTexture( this.dyeTexB ).toWriteOnly();
		this.curlNoiseTexNode = texture3D( this.curlNoiseTex );

		this.uDt = uniform( 0.0083 );
		this.uTime = uniform( 0 );
		this.uBuoyancy = uniform( this.params.buoyancy );
		this.uWeight = uniform( this.params.weight );
		this.uTurbulence = uniform( this.params.turbulence );
		this.uTurbulenceDecay = uniform( this.params.turbulenceDecay );
		this.uTurbFrequency = uniform( this.params.turbFrequency );
		this.uTurbulenceBias = uniform( this.params.turbulenceBias );
		this.uTurbulenceDir = uniform( new THREE.Vector3( 0, 1, 0 ) );
		this.uVelDamping = uniform( this.params.velDamping );
		this.uDissipation = uniform( 1 / this.params.smokeLifespan );
		this.uCooling = uniform( 1 / this.params.tempLifespan );
		this.uVolumeWorldSize = uniform( new THREE.Vector3(
			this.params.volumeSize,
			this.params.volumeSize,
			this.params.volumeSize,
		) );
		// 1 = apply soft domain walls; 0 = unrestricted (no wall damp / shell fade)
		this.uBoundaryLimit = uniform( this.params.unrestricted ? 0.0 : 1.0 );

		this.uHitCenterUVW = uniform( new THREE.Vector3( 0.5, 0.5, 0.5 ) );
		// Shader splat is in UVW; convert from world-meter hitRadius at arm / resize time
		this.uHitRadiusUVW = uniform( this._worldRadiusToUVW( this.params.hitRadius ) );
		this.uHitDensity = uniform( this.params.hitDensity );
		this.uHitTemperature = uniform( this.params.hitTemperature );
		/** Hit / seed orientation axis (object space). */
		this.uHitDirOS = uniform( new THREE.Vector3( 0, 1, 0 ) );
		/** Impulse push / swirl axis — may differ from hit when custom direction mode. */
		this.uImpulseDirOS = uniform( new THREE.Vector3( 0, 1, 0 ) );
		this.uSeedAxisOS = uniform( new THREE.Vector3( 0, 1, 0 ) );
		/** Local +X after seed orientation — arc center (")") faces +tangent). */
		this.uSeedTangentOS = uniform( new THREE.Vector3( 1, 0, 0 ) );
		/** Curl sample shift from spawnSeed (deterministic per spawn). */
		this.uNoiseOffset = uniform( new THREE.Vector3( 0, 0, 0 ) );
		/** Locked jitter from spawnSeed for this burst; cleared on reset. */
		this._spawnVariation = null;
		this._seedQuat = new THREE.Quaternion();
		this.uDoSplat = uniform( 0 );
		this.uSeedShape = uniform( SEED_SHAPE_ID[ this.params.seedShape ] ?? 0 );
		this.uShapeThickness = uniform( this.params.shapeThickness );
		this.uRingRadiusRatio = uniform( this.params.ringRadiusRatio );
		this.uRingWidth = uniform( this.params.ringWidth );
		this.uArcHalfRad = uniform(
			Math.max( ( this.params.arcAngle || 140 ) * 0.5 * Math.PI / 180, 1e-3 ),
		);
		this.uArrowHalfRad = uniform(
			Math.max( ( this.params.arrowAngle || 70 ) * 0.5 * Math.PI / 180, 1e-3 ),
		);
		this.uArrowLength = uniform( this.params.arrowLength ?? 1.0 );
		this.uColumnHeight = uniform( this.params.columnHeight );
		// Strand (缕烟) seed — CPU packs into strandBuf; seedWeight composites when mode on.
		this.uStrandMode = uniform( this.params.strandMode ? 1.0 : 0.0 );
		this.uStrandCount = uniform( 0.0 );
		this.uStrandGapFill = uniform( this.params.strandGapFill );
		this.uStrandEdgeSoft = uniform( this.params.strandEdgeSoftness );
		this.uStrandHaloR = uniform( 0.05 );
		/** Compensates thin rope fill vs solid blob so dye/impulse stay in fluid range. */
		this.uStrandDensMul = uniform( 1.35 );
		this.strandBuf = instancedArray( MAX_STRANDS * 4, 'vec4' );
		this._strandCpuBuf = new Float32Array( MAX_STRANDS * 16 );
		// Live hit-force state (set by armSplat, decayed each substep)
		this.uImpulseActive = uniform( 0.0 );
		this.uImpulseRadial = uniform( this.params.impulseRadial );
		this.uImpulseSwirl = uniform( this.params.impulseSwirl );
		this.uImpulseScaleBox = uniform( this.params.impulseScaleWithBox ? 1.0 : 0.0 );
		this.uVelDisplayWarp = uniform( this.params.velDisplayWarp );
		this._impulseLeft = 0;

		this.uShadowAbsorption = uniform( this.params.shadowAbsorption );
		this.uShadowAmbient = uniform( this.params.shadowAmbient );
		this.uPowderStrength = uniform( this.params.powderStrength );
		this.uMultiScattering = uniform( this.params.multiScattering );
		this.uAsymmetry = uniform( this.params.phaseAsymmetry );
		this.uSmokeColor = uniform( new THREE.Color( this.params.smokeColor ) );
		this.uDensityGain = uniform( this.params.densityGain );
		/** Multiplies scattering while fading out (1 → 0). */
		this.uFadeMul = uniform( 1.0 );
		this.uKeyLightPos = uniform( new THREE.Vector3( - 4, 8, 4 ) );

		// Peak dye.r as float bit pattern (uint atomicMax is ordered for ≥0 floats).
		this.peakDensityBits = instancedArray( 1, 'uint' ).toAtomic();

		this._createHelpers();
		this._createComputePasses();
		this._createMaterial();

		const size0 = this.params.volumeSize;
		this.mesh = new THREE.Mesh(
			new THREE.BoxGeometry( size0, size0, size0 ),
			this.volumetricMaterial,
		);
		this.mesh.visible = false;
		this.mesh.frustumCulled = false;

	}

	_createHelpers() {

		this.getVoxelCoord = ( id ) => {

			const x = id.mod( GRID );
			const y = id.div( GRID ).mod( GRID );
			const z = id.div( GRID * GRID );
			return uvec3( x, y, z );

		};

		this.coordToUVW = ( coord ) => vec3( coord ).add( 0.5 ).div( vec3( GRID, GRID, GRID ) );

	}

	_createComputePasses() {

		const getVoxelCoord = this.getVoxelCoord;
		const coordToUVW = this.coordToUVW;
		const {
			velTexA, velTexB, dyeTexA, dyeTexB, divTex, pressTexA, pressTexB,
			dyeTexNode, dyeTexWriteNode, curlNoiseTex, curlNoiseTexNode,
			uDt, uTime, uBuoyancy, uWeight, uTurbulence, uTurbulenceDecay,
			uTurbFrequency, uTurbulenceBias, uTurbulenceDir,
			uVelDamping, uDissipation, uCooling, uVolumeWorldSize,
			uBoundaryLimit,
			uHitCenterUVW, uHitRadiusUVW, uHitDensity, uHitTemperature,
			uHitDirOS, uImpulseDirOS, uSeedAxisOS, uSeedTangentOS, uNoiseOffset, uDoSplat,
			uSeedShape, uShapeThickness, uRingRadiusRatio, uRingWidth, uArcHalfRad,
			uArrowHalfRad, uArrowLength, uColumnHeight,
			uStrandMode, uStrandCount, uStrandGapFill, uStrandEdgeSoft, uStrandHaloR,
			uStrandDensMul,
			strandBuf,
			uImpulseActive, uImpulseRadial, uImpulseSwirl, uImpulseScaleBox,
		} = this;

		const distToSegment = ( a, b, p ) => {

			const ab = b.sub( a );
			const denom = max( dot( ab, ab ), float( 1e-8 ) );
			const t = clamp( dot( p.sub( a ), ab ).div( denom ), float( 0 ), float( 1 ) );
			return length( p.sub( a.add( ab.mul( t ) ) ) );

		};

		const bezier3 = ( p0, p1, p2, t ) => {

			const u = float( 1 ).sub( t );
			return p0.mul( u.mul( u ) ).add( p1.mul( float( 2 ).mul( u ).mul( t ) ) ).add( p2.mul( t.mul( t ) ) );

		};

		// Seed mask: overall size = uHitRadiusUVW; axis = hit dir + seedRotation.
		// Optional strand mode: composite rope tubes + halo inside the shell.
		const seedWeight = Fn( ( [ uvw ] ) => {

			const axis = uSeedAxisOS.div( max( length( uSeedAxisOS ), float( 1e-4 ) ) );
			const delta = uvw.sub( uHitCenterUVW );
			const r = max( uHitRadiusUVW, float( 1e-4 ) );
			const along = dot( delta, axis );
			const planar = delta.sub( axis.mul( along ) );
			const rho = length( planar );
			const thick = max( r.mul( uShapeThickness ), float( 1e-4 ) );
			const alongW = exp( along.mul( along ).negate().div( thick.mul( thick ) ) );

			const dist3 = length( delta );
			const wSphere = exp( dist3.mul( dist3 ).negate().div( r.mul( r ) ) );
			const wDisk = exp( rho.mul( rho ).negate().div( r.mul( r ) ) ).mul( alongW );

			const ringPeak = r.mul( uRingRadiusRatio );
			const ringW = max( r.mul( uRingWidth ), float( 1e-4 ) );
			const ringDelta = rho.sub( ringPeak );
			const wRing = exp( ringDelta.mul( ringDelta ).negate().div( ringW.mul( ringW ) ) ).mul( alongW );

			// Arc = ring segment centered on local +X (")" opening faces −X).
			const tangent = uSeedTangentOS.div( max( length( uSeedTangentOS ), float( 1e-4 ) ) );
			// Same as gizmo / strandSeed: +Z = tangent × axis (not axis × tangent).
			const bitangent = cross( tangent, axis );
			const ang = atan( dot( planar, bitangent ), dot( planar, tangent ) );
			const halfSpan = max( uArcHalfRad, float( 1e-3 ) );
			const soft = max( halfSpan.mul( float( 0.22 ) ), float( 0.06 ) );
			const wAngle = float( 1 ).sub(
				smoothstep( halfSpan.sub( soft ), halfSpan.add( soft ), abs( ang ) ),
			);
			const wArc = wRing.mul( wAngle );

			// Arrow ">" : tip at center pointing +tangent; arms open toward −tangent.
			const halfOpen = max( uArrowHalfRad, float( 1e-3 ) );
			const armLen = max( r.mul( uArrowLength ), float( 1e-4 ) );
			const cOpen = cos( halfOpen );
			const sOpen = sin( halfOpen );
			const dirU = tangent.mul( cOpen.negate() ).add( bitangent.mul( sOpen ) );
			const dirL = tangent.mul( cOpen.negate() ).add( bitangent.mul( sOpen.negate() ) );
			const tU = clamp( dot( planar, dirU ), float( 0 ), armLen );
			const tL = clamp( dot( planar, dirL ), float( 0 ), armLen );
			const dU = length( planar.sub( dirU.mul( tU ) ) );
			const dL = length( planar.sub( dirL.mul( tL ) ) );
			const dArm = min( dU, dL );
			const wArrow = exp( dArm.mul( dArm ).negate().div( ringW.mul( ringW ) ) ).mul( alongW );

			const colH = max( r.mul( uColumnHeight ), float( 1e-4 ) );
			const wColumn = exp( rho.mul( rho ).negate().div( r.mul( r ) ) )
				.mul( exp( along.mul( along ).negate().div( colH.mul( colH ) ) ) );

			const w = wSphere.toVar();
			If( uSeedShape.equal( float( 1 ) ), () => {

				w.assign( wDisk );

			} );
			If( uSeedShape.equal( float( 2 ) ), () => {

				w.assign( wRing );

			} );
			If( uSeedShape.equal( float( 3 ) ), () => {

				w.assign( wColumn );

			} );
			If( uSeedShape.equal( float( 4 ) ), () => {

				w.assign( wArc );

			} );
			If( uSeedShape.equal( float( 5 ) ), () => {

				w.assign( wArrow );

			} );

			If( uStrandMode.greaterThan( 0.5 ), () => {

				const sw = float( 0 ).toVar();
				const dMin = float( 10 ).toVar();
				const rNear = max( uStrandHaloR, float( 1e-4 ) ).toVar();

				Loop( { start: int( 0 ), end: int( MAX_STRANDS ), type: 'int', condition: '<' }, ( { i } ) => {

					If( float( i ).lessThan( uStrandCount ), () => {

						const base = i.mul( int( 4 ) );
						const a = strandBuf.element( base );
						const b = strandBuf.element( base.add( int( 1 ) ) );
						const c = strandBuf.element( base.add( int( 2 ) ) );
						const p0 = a.xyz;
						const p1 = b.xyz;
						const p2 = c.xyz;
						const r0 = max( a.w, float( 1e-5 ) );
						const rMid = max( b.w, float( 1e-5 ) );
						const r1 = max( c.w, float( 1e-5 ) );

						const q0 = bezier3( p0, p1, p2, float( 0 ) );
						const q1 = bezier3( p0, p1, p2, float( 0.25 ) );
						const q2 = bezier3( p0, p1, p2, float( 0.5 ) );
						const q3 = bezier3( p0, p1, p2, float( 0.75 ) );
						const q4 = bezier3( p0, p1, p2, float( 1 ) );

						const radAt = ( t ) => {

							const t01 = clamp( t, float( 0 ), float( 1 ) );
							const low = mix( r0, rMid, clamp( t01.mul( 2.0 ), float( 0 ), float( 1 ) ) );
							const high = mix( rMid, r1, clamp( t01.sub( 0.5 ).mul( 2.0 ), float( 0 ), float( 1 ) ) );
							return mix( low, high, step( float( 0.5 ), t01 ) );

						};

						const d0 = distToSegment( q0, q1, uvw );
						const d1 = distToSegment( q1, q2, uvw );
						const d2 = distToSegment( q2, q3, uvw );
						const d3 = distToSegment( q3, q4, uvw );
						// Artistic Gaussian follows authored radius (can be sub-voxel).
						// Sharp ~1-voxel cover ribbon engages only when rArt is too thin
						// to hit the lattice — survival without soft-fattening all ratios.
						const tubeAt = ( d, t ) => {

							const rArt = max( radAt( t ).mul( float( 1.05 ) ), float( 1e-5 ) );
							const artistic = exp( d.mul( d ).negate().div( rArt.mul( rArt ) ) );
							const cover = smoothstep( float( TEXEL * 0.68 ), float( TEXEL * 0.12 ), d );
							const needCover = float( 1 ).sub(
								smoothstep( float( TEXEL * 0.35 ), float( TEXEL * 0.7 ), radAt( t ) ),
							);
							return max( artistic, cover.mul( needCover ) );

						};
						const tube0 = tubeAt( d0, float( 0.125 ) );
						const tube1 = tubeAt( d1, float( 0.375 ) );
						const tube2 = tubeAt( d2, float( 0.625 ) );
						const tube3 = tubeAt( d3, float( 0.875 ) );
						const tube = max( max( tube0, tube1 ), max( tube2, tube3 ) );
						const d = min( min( d0, d1 ), min( d2, d3 ) );
						const rad = radAt( float( 0.5 ) );
						sw.assign( max( sw, tube ) );
						If( d.lessThan( dMin ), () => {

							dMin.assign( d );
							rNear.assign( rad );

						} );

					} );

				} );

				const gateHard = smoothstep( float( 0.08 ), float( 0.25 ), w );
				const gateSoft = smoothstep( float( 0.01 ), float( 0.12 ), w );
				const gate = mix( gateHard, gateSoft, uStrandEdgeSoft );
				// Keep a floor so ropes just outside the soft shell still inject / receive impulse.
				const gateFloor = max( gate, float( 0.28 ) );
				const haloR = max( rNear.mul( float( 2.2 ) ), uStrandHaloR );
				const halo = w.mul( uStrandGapFill )
					.mul( exp( dMin.mul( dMin ).negate().div( haloR.mul( haloR ) ) ) )
					.mul( float( 1 ).sub( min( sw, float( 1 ) ) ) );
				w.assign( sw.mul( gateFloor ).mul( uStrandDensMul ).add( halo ) );

			} );

			return w;

		} );

		// Cube domain: aspect stays 1; buoyancy scales with live uVolumeWorldSize.y

		// Bridson curl via FD of snoiseVec3 — official computeCurlNoisePass
		this.computeCurlNoisePass = Fn( () => {

			const coord = getVoxelCoord( instanceIndex );
			const uvw = coordToUVW( coord );

			const freq = uTurbFrequency;
			const e = float( 0.1 ).div( freq );
			const dx = vec3( e, 0.0, 0.0 );
			const dy = vec3( 0.0, e, 0.0 );
			const dz = vec3( 0.0, 0.0, e );

			const p = uvw; // cube volume — no non-uniform aspect
			const p_x0 = snoiseVec3( p.sub( dx ).mul( freq ) );
			const p_x1 = snoiseVec3( p.add( dx ).mul( freq ) );
			const p_y0 = snoiseVec3( p.sub( dy ).mul( freq ) );
			const p_y1 = snoiseVec3( p.add( dy ).mul( freq ) );
			const p_z0 = snoiseVec3( p.sub( dz ).mul( freq ) );
			const p_z1 = snoiseVec3( p.add( dz ).mul( freq ) );

			const x = p_y1.z.sub( p_y0.z ).sub( p_z1.y ).add( p_z0.y );
			const y = p_z1.x.sub( p_z0.x ).sub( p_x1.z ).add( p_x0.z );
			const z = p_x1.y.sub( p_x0.y ).sub( p_y1.x ).add( p_y0.x );

			const noiseVal = vec3( x, y, z ).mul( 5.0 );
			textureStore( curlNoiseTex, coord, vec4( noiseVal, 0.0 ) ).toWriteOnly();

		} )().compute( CELL_COUNT ).setName( 'computeCurlNoise' );

		// Semi-Lagrangian + buoyancy/weight + curl turb + soft border (Stam GDC03 / volume_fire)
		// read velTexA → write velTexB
		this.advectVelocityPass = Fn( () => {

			const coord = getVoxelCoord( instanceIndex );
			const uvw = coordToUVW( coord );

			const vel = texture3D( velTexA, uvw, 0 ).xyz;
			const velUVW = vel.div( uVolumeWorldSize );
			const prevPos = uvw.sub( velUVW.mul( uDt ) );
			const newVel = texture3D( velTexA, prevPos, 0 ).xyz.toVar();

			const dye = dyeTexNode.sample( uvw ).level( 0 );
			const density = dye.r;
			const temperature = dye.g;
			const age = dye.b;

			const buoyancyForce = temperature.mul( uBuoyancy ).sub( density.mul( uWeight ) ).mul( uVolumeWorldSize.y );
			newVel.addAssign( vec3( 0, buoyancyForce, 0 ).mul( uDt ) );

			const thermalNoisePos = uvw.add( uNoiseOffset )
				.add( vec3( 0, age.negate().mul( 0.6 ), age.mul( 0.13 ) ).div( uTurbFrequency ) );
			const decay = age.mul( uTurbulenceDecay.negate() ).exp();
			const thermalTurbulence = curlNoiseTexNode.sample( thermalNoisePos ).level( 0 ).xyz
				.mul( uTurbulence ).mul( temperature ).mul( decay );

			const ambientNoisePos = uvw.mul( 0.5 ).add( uNoiseOffset )
				.add( vec3( 0, uTime.mul( 0.25 ), uTime.mul( 0.06 ) ).div( uTurbFrequency ) );
			const ambientTurbulence = curlNoiseTexNode.sample( ambientNoisePos ).level( 0 ).xyz
				.mul( uTurbulence.mul( 0.2 ) ).mul( density );

			// Optional preferred axis: rotate curl direction toward (to − from), keep magnitude.
			const rawTurb = thermalTurbulence.add( ambientTurbulence ).toVar();
			If( uTurbulenceBias.greaterThan( 0.001 ), () => {

				const mag = length( rawTurb );
				const noiseDir = rawTurb.div( max( mag, float( 1e-4 ) ) );
				const blended = mix( noiseDir, uTurbulenceDir, uTurbulenceBias );
				rawTurb.assign( blended.div( max( length( blended ), float( 1e-4 ) ) ).mul( mag ) );

			} );

			const turbulence = rawTurb.mul( uVolumeWorldSize.y );
			newVel.addAssign( turbulence.mul( uDt ) );

			// Hit impulse: directional and/or radial + swirl (axis = uImpulseDirOS, not seed hit).
			// Applied for several substeps; dye is injected before this pass on the spawn frame.
			If( uImpulseActive.greaterThan( 0.001 ), () => {

				const delta = uvw.sub( uHitCenterUVW );
				const dist = length( delta );
				const w = seedWeight( uvw );
				const radial = delta.div( max( dist, float( 1e-4 ) ) );
				const swirl = cross( uImpulseDirOS, radial );
				const dirPush = uImpulseDirOS.mul( float( 1.0 ).sub( uImpulseRadial ) )
					.add( radial.mul( uImpulseRadial ) )
					.add( swirl.mul( uImpulseSwirl ) );
				const dirN = dirPush.div( max( length( dirPush ), float( 1e-4 ) ) );
				const boxScale = mix( float( 1.0 ), uVolumeWorldSize.y, uImpulseScaleBox );
				newVel.addAssign( dirN.mul( uImpulseActive ).mul( w ).mul( uDt ).mul( boxScale ) );

			} );

			newVel.mulAssign( max( float( 1 ).sub( uVelDamping.mul( uDt ) ), 0 ) );

			// Restricted: soft wall damp. Unrestricted: open outflow faces (no bounce-back).
			const edge = min( uvw, vec3( 1 ).sub( uvw ) );
			const softBorder = smoothstep( 0.0, 0.12, min( edge.x, min( edge.y, edge.z ) ) );
			const closedVel = newVel.mul( softBorder );
			const openVel = newVel.toVar();
			If( uvw.x.lessThan( 0.02 ), () => {

				openVel.x.assign( min( openVel.x, float( 0.0 ) ) );

			} );
			If( uvw.x.greaterThan( 0.98 ), () => {

				openVel.x.assign( max( openVel.x, float( 0.0 ) ) );

			} );
			If( uvw.y.lessThan( 0.02 ), () => {

				openVel.y.assign( min( openVel.y, float( 0.0 ) ) );

			} );
			If( uvw.y.greaterThan( 0.98 ), () => {

				openVel.y.assign( max( openVel.y, float( 0.0 ) ) );

			} );
			If( uvw.z.lessThan( 0.02 ), () => {

				openVel.z.assign( min( openVel.z, float( 0.0 ) ) );

			} );
			If( uvw.z.greaterThan( 0.98 ), () => {

				openVel.z.assign( max( openVel.z, float( 0.0 ) ) );

			} );
			newVel.assign( mix( openVel, closedVel, uBoundaryLimit ) );

			textureStore( velTexB, coord, vec4( newVel, 0 ) ).toWriteOnly();

		} )().compute( CELL_COUNT ).setName( 'advectVelocity' );

		// Divergence — GPU Gems 38; reads vel after advect (velTexB)
		this.divergencePass = Fn( () => {

			const coord = getVoxelCoord( instanceIndex );
			const uvw = coordToUVW( coord );

			const vR = texture3D( velTexB, uvw.add( vec3( TEXEL, 0, 0 ) ), 0 ).x;
			const vL = texture3D( velTexB, uvw.sub( vec3( TEXEL, 0, 0 ) ), 0 ).x;
			const vU = texture3D( velTexB, uvw.add( vec3( 0, TEXEL, 0 ) ), 0 ).y;
			const vD = texture3D( velTexB, uvw.sub( vec3( 0, TEXEL, 0 ) ), 0 ).y;
			const vF = texture3D( velTexB, uvw.add( vec3( 0, 0, TEXEL ) ), 0 ).z;
			const vB = texture3D( velTexB, uvw.sub( vec3( 0, 0, TEXEL ) ), 0 ).z;

			const divergence = vR.sub( vL ).add( vU.sub( vD ) ).add( vF.sub( vB ) ).mul( 0.5 );
			textureStore( divTex, coord, vec4( divergence, 0, 0, 0 ) ).toWriteOnly();

		} )().compute( CELL_COUNT ).setName( 'divergence' );

		const jacobi = ( pressRead, pressWrite, name ) => Fn( () => {

			const coord = getVoxelCoord( instanceIndex );
			const uvw = coordToUVW( coord );

			const pR = texture3D( pressRead, uvw.add( vec3( TEXEL, 0, 0 ) ), 0 ).x;
			const pL = texture3D( pressRead, uvw.sub( vec3( TEXEL, 0, 0 ) ), 0 ).x;
			const pU = texture3D( pressRead, uvw.add( vec3( 0, TEXEL, 0 ) ), 0 ).x;
			const pD = texture3D( pressRead, uvw.sub( vec3( 0, TEXEL, 0 ) ), 0 ).x;
			const pF = texture3D( pressRead, uvw.add( vec3( 0, 0, TEXEL ) ), 0 ).x;
			const pB = texture3D( pressRead, uvw.sub( vec3( 0, 0, TEXEL ) ), 0 ).x;

			const divergence = texture3D( divTex, uvw, 0 ).x;
			const pressure = pR.add( pL ).add( pU ).add( pD ).add( pF ).add( pB ).sub( divergence ).div( 6 );
			textureStore( pressWrite, coord, vec4( pressure, 0, 0, 0 ) ).toWriteOnly();

		} )().compute( CELL_COUNT ).setName( name );

		this.jacobiPassAB = jacobi( pressTexA, pressTexB, 'jacobiAB' );
		this.jacobiPassBA = jacobi( pressTexB, pressTexA, 'jacobiBA' );

		// Project: velTexB - grad(p) → velTexA (official end-of-frame velocity)
		this.projectPass = Fn( () => {

			const coord = getVoxelCoord( instanceIndex );
			const uvw = coordToUVW( coord );

			const pR = texture3D( pressTexA, uvw.add( vec3( TEXEL, 0, 0 ) ), 0 ).x;
			const pL = texture3D( pressTexA, uvw.sub( vec3( TEXEL, 0, 0 ) ), 0 ).x;
			const pU = texture3D( pressTexA, uvw.add( vec3( 0, TEXEL, 0 ) ), 0 ).x;
			const pD = texture3D( pressTexA, uvw.sub( vec3( 0, TEXEL, 0 ) ), 0 ).x;
			const pF = texture3D( pressTexA, uvw.add( vec3( 0, 0, TEXEL ) ), 0 ).x;
			const pB = texture3D( pressTexA, uvw.sub( vec3( 0, 0, TEXEL ) ), 0 ).x;

			const gradient = vec3( pR.sub( pL ), pU.sub( pD ), pF.sub( pB ) ).mul( 0.5 );
			const vel = texture3D( velTexB, uvw, 0 ).xyz.sub( gradient );
			textureStore( velTexA, coord, vec4( vel, 0 ) ).toWriteOnly();

		} )().compute( CELL_COUNT ).setName( 'project' );

		// Dye advect; age uses nearest UVW (volume_fire)
		this.advectDyePass = Fn( () => {

			const coord = getVoxelCoord( instanceIndex );
			const uvw = coordToUVW( coord );

			const vel = texture3D( velTexA, uvw, 0 ).xyz;
			const velUVW = vel.div( uVolumeWorldSize );
			const prevPos = uvw.sub( velUVW.mul( uDt ) );

			const dye = dyeTexNode.sample( prevPos ).level( 0 );
			const density = dye.r.mul( max( float( 1 ).sub( uDissipation.mul( uDt ) ), 0 ) ).toVar();
			const temperature = dye.g.mul( max( float( 1 ).sub( uCooling.mul( uDt ) ), 0 ) ).toVar();

			const gridDims = vec3( GRID, GRID, GRID );
			const nearestUVW = floor( prevPos.mul( gridDims ) ).add( 0.5 ).div( gridDims );
			const age = dyeTexNode.sample( nearestUVW ).level( 0 ).b.add( uDt ).toVar();

			temperature.assign( temperature.clamp( 0, 12 ) );

			// Soft-clear dye near domain walls (skipped when unrestricted)
			const edge = min( uvw, vec3( 1 ).sub( uvw ) );
			const softBorder = smoothstep( 0.0, 0.1, min( edge.x, min( edge.y, edge.z ) ) );
			const border = mix( float( 1.0 ), softBorder, uBoundaryLimit );
			density.mulAssign( border );
			temperature.mulAssign( border );

			If( density.lessThanEqual( 0.01 ), () => {

				age.assign( 0.0 );

			} );

			textureStore( dyeTexWriteNode, coord, vec4( density, temperature, age, 1.0 ) ).toWriteOnly();

		} )().compute( CELL_COUNT ).setName( 'advectDye' );

		// Full-field copy-through + Gaussian hit (replaces emitTeapot). Caller must ping-pong
		// so dyeTexNode holds post-advect before this runs (see stepOneSubstep).
		this.splatHitDyePass = Fn( () => {

			const coord = getVoxelCoord( instanceIndex );
			const uvw = coordToUVW( coord );
			const dye = dyeTexNode.sample( uvw ).level( 0 );
			const w = seedWeight( uvw );
			const gate = uDoSplat.greaterThan( 0.5 ).select( float( 1 ), float( 0 ) );
			const addD = uHitDensity.mul( w ).mul( gate );
			const addT = uHitTemperature.mul( w ).mul( gate );
			const newD = dye.r.add( addD );
			const newT = dye.g.add( addT ).clamp( 0.0, 12.0 );
			const newAge = mix( dye.b, float( 0.0 ), addD.div( max( newD, float( 0.001 ) ) ) );
			textureStore( dyeTexWriteNode, coord, vec4( newD, newT, newAge, 1.0 ) ).toWriteOnly();

		} )().compute( CELL_COUNT ).setName( 'splatHitDye' );

		const zeroTex = ( tex, name, alpha = 0 ) => Fn( () => {

			const coord = getVoxelCoord( instanceIndex );
			textureStore( tex, coord, vec4( 0, 0, 0, alpha ) ).toWriteOnly();

		} )().compute( CELL_COUNT ).setName( name );

		this.zeroFillPasses = [
			zeroTex( velTexA, 'zeroVelA' ),
			zeroTex( velTexB, 'zeroVelB' ),
			zeroTex( dyeTexA, 'zeroDyeA', 1 ),
			zeroTex( dyeTexB, 'zeroDyeB', 1 ),
			zeroTex( divTex, 'zeroDiv' ),
			zeroTex( pressTexA, 'zeroPressA' ),
			zeroTex( pressTexB, 'zeroPressB' ),
		];

		const peakBits = this.peakDensityBits;
		this.clearPeakDensityPass = Fn( () => {

			atomicStore( peakBits.element( 0 ), uint( 0 ) );

		} )().compute( 1 ).setName( 'clearPeakDensity' );

		this.reducePeakDensityPass = Fn( () => {

			const coord = getVoxelCoord( instanceIndex );
			const uvw = coordToUVW( coord );
			const density = dyeTexNode.sample( uvw ).level( 0 ).r;
			// Positive floats: IEEE bit order matches numeric order → atomicMax works.
			atomicMax( peakBits.element( 0 ), floatBitsToUint( density ) );

		} )().compute( CELL_COUNT ).setName( 'reducePeakDensity' );

	}

	_createMaterial() {

		const {
			dyeTexNode, velTexA, uVolumeWorldSize, uBoundaryLimit, uVelDisplayWarp,
			uShadowAbsorption, uShadowAmbient,
			uPowderStrength, uMultiScattering, uAsymmetry, uSmokeColor, uDensityGain, uFadeMul,
			uKeyLightPos,
		} = this;

		const volumetricMaterial = new THREE.VolumeNodeMaterial();
		volumetricMaterial.steps = this.params.raymarchSteps;
		volumetricMaterial.transparent = true;
		volumetricMaterial.depthWrite = false;
		// Match VolumeNodeMaterial defaults / webgpu_volume_fire: depthTest off + Additive.
		// NormalBlending + volumetric raymarch paints the whole AABB as a black fog cube
		// (VolumetricLightingModel was built around additive fog; see PR #30530 notes).
		volumetricMaterial.depthTest = false;
		volumetricMaterial.blending = THREE.AdditiveBlending;
		volumetricMaterial.side = THREE.BackSide;

		volumetricMaterial.offsetNode = fract(
			interleavedGradientNoise( screenCoordinate )
				.add( float( frameId ).mul( 0.618033988749895 ) ),
		);

		// Movable AABB: object-local UVW via modelWorldMatrixInverse (PR #28433) — no extra translation.
		// Do NOT clamp here: clamping outside→face UV creates density sheets on the box walls.
		const getLocalUVW = Fn( ( [ posWorld ] ) => {

			const positionLocal = modelWorldMatrixInverse.mul( vec4( posWorld, 1.0 ) ).xyz;
			return positionLocal.div( uVolumeWorldSize ).add( 0.5 );

		} );

		const henyeyGreenstein = Fn( ( [ cosTheta, g ] ) => {

			const g2 = g.mul( g );
			const denom = float( 1.0 ).add( g2 ).sub( float( 2.0 ).mul( g ).mul( cosTheta ) );
			const oneMinusG2 = float( 1.0 ).sub( g2 );
			return oneMinusG2.div( denom.pow( 1.5 ) ).mul( 0.079577 );

		} );

		const getVolumeSample = ( { positionRay } ) => {

			const uvw = getLocalUVW( positionRay ).toVar();
			const density = float( 0.0 ).toVar();
			const temperature = float( 0.0 ).toVar();
			const age = float( 0.0 ).toVar();
			const distortedUVW = uvw.toVar();

			// Outside the unit cube → zero density (avoids clamped face sheets)
			const inside = uvw.x.greaterThan( 0.0 ).and( uvw.x.lessThan( 1.0 ) )
				.and( uvw.y.greaterThan( 0.0 ) ).and( uvw.y.lessThan( 1.0 ) )
				.and( uvw.z.greaterThan( 0.0 ) ).and( uvw.z.lessThan( 1.0 ) );

			If( inside, () => {

				// Clamp warp so large hit velocities cannot flash the additive volume white
				const noiseDistortion = texture3D( velTexA, uvw, 0 ).xyz
					.div( uVolumeWorldSize )
					.mul( uVelDisplayWarp )
					.clamp( - 0.08, 0.08 );
				distortedUVW.assign( uvw.add( noiseDistortion ).clamp( 0.0, 1.0 ) );

				const sample = dyeTexNode.sample( distortedUVW ).level( 0 );
				density.assign( sample.r );
				temperature.assign( sample.g );
				age.assign( sample.b );

				const detailNoise = snoise( positionRay.mul( 5.5 ).add( vec3( 0, age.mul( 0.8 ).negate(), 0 ) ) );
				density.mulAssign( detailNoise.mul( 0.35 ).add( 0.85 ) );

				// Soft AABB shell fade; unrestricted → only a tiny AA fade (0.02)
				const edge = min( distortedUVW, vec3( 1 ).sub( distortedUVW ) );
				const fadeWidth = mix( float( 0.02 ), float( 0.14 ), uBoundaryLimit );
				density.mulAssign( smoothstep( 0.0, fadeWidth, min( edge.x, min( edge.y, edge.z ) ) ) );

			} );

			return { density, temperature, age, distortedUVW };

		};

		// Official smoke scattering path only (no fire emissive)
		volumetricMaterial.scatteringNode = Fn( ( { positionRay } ) => {

			const { density } = getVolumeSample( { positionRay } );

			const lightDir = uKeyLightPos.sub( positionRay ).normalize();
			const shadowDensitySum = float( 0.0 ).toVar();
			const shadowStepSize = 0.35;

			for ( let i = 0; i < 2; i ++ ) {

				const stepDist = ( i + 0.5 ) * shadowStepSize;
				const shadowPos = positionRay.add( lightDir.mul( stepDist ) );
				const shadowUVW = getLocalUVW( shadowPos ).clamp( 0.0, 1.0 );
				const shadowEdge = min( shadowUVW, vec3( 1 ).sub( shadowUVW ) );
				const shadowFadeWidth = mix( float( 0.02 ), float( 0.14 ), uBoundaryLimit );
				const shadowFade = smoothstep( 0.0, shadowFadeWidth, min( shadowEdge.x, min( shadowEdge.y, shadowEdge.z ) ) );
				const shadowSample = dyeTexNode.sample( shadowUVW ).level( 0 ).r.mul( shadowFade );
				shadowDensitySum.addAssign( shadowSample );

			}

			const tau = shadowDensitySum.mul( shadowStepSize ).mul( uShadowAbsorption );
			const beer = tau.negate().exp();
			const multiScatter = tau.mul( 0.25 ).negate().exp().mul( 0.5 );
			const baseTransmittance = mix( beer, beer.add( multiScatter ), uMultiScattering );
			const powder = float( 1.0 ).sub( tau.mul( 2.0 ).negate().exp() );
			const finalTransmittance = mix( baseTransmittance, baseTransmittance.mul( powder ), uPowderStrength );
			const lightTransmittance = finalTransmittance.add( uShadowAmbient ).clamp( 0.0, 1.0 );

			const viewDir = cameraPosition.sub( positionRay ).normalize();
			const cosTheta = viewDir.dot( lightDir ).clamp( - 1.0, 1.0 );
			const phase = henyeyGreenstein( cosTheta, uAsymmetry );

			return uSmokeColor.mul( density ).mul( uDensityGain ).mul( uFadeMul )
				.mul( lightTransmittance ).mul( phase.mul( 12.56637 ) );

		} );

		volumetricMaterial.scatteringEmissiveNode = Fn( ( { positionRay } ) => {

			return vec3( 0.0 );

		} );

		this.volumetricMaterial = volumetricMaterial;
		this.getLocalUVW = getLocalUVW;

	}

	/** Official one-shot curl precompute. */
	async initCurl() {

		if ( this._curlReady ) return;
		await this.renderer.computeAsync( this.computeCurlNoisePass );
		this._curlReady = true;

	}

	/**
	 * Convert world-meter splat radius → UVW radius for the current box.
	 * Keeps initial smoke size stable when the domain AABB changes.
	 * @param {number} radiusWorld
	 */
	_worldRadiusToUVW( radiusWorld ) {

		const size = Math.max( this.uVolumeWorldSize?.value?.x ?? this.params.volumeSize, 1e-4 );
		return Math.max( radiusWorld / size, 1e-4 );

	}

	/** Refresh uHitRadiusUVW from params.hitRadius (world meters), with spawnSeed scale. */
	syncHitRadiusUVW() {

		const scale = this._spawnVariation?.radiusScale ?? 1;
		this.uHitRadiusUVW.value = this._worldRadiusToUVW( this.params.hitRadius * scale );

	}

	/** Sync seed shape uniforms from params. */
	syncSeedShape() {

		this.uSeedShape.value = SEED_SHAPE_ID[ this.params.seedShape ] ?? 0;
		this.uShapeThickness.value = this.params.shapeThickness;
		this.uRingRadiusRatio.value = this.params.ringRadiusRatio;
		this.uRingWidth.value = this.params.ringWidth;
		this.uArcHalfRad.value = Math.max(
			( this.params.arcAngle ?? 140 ) * 0.5 * Math.PI / 180,
			1e-3,
		);
		this.uArrowHalfRad.value = Math.max(
			( this.params.arrowAngle ?? 70 ) * 0.5 * Math.PI / 180,
			1e-3,
		);
		this.uArrowLength.value = this.params.arrowLength ?? 1.0;
		this.uColumnHeight.value = this.params.columnHeight;
		this.syncSeedAxis();

	}

	/**
	 * Build strand ropes on CPU and upload to strandBuf.
	 * Call after center / radius / seed axis are current (armSplat).
	 */
	syncStrandSeed() {

		const p = this.params;
		if ( ! p.strandMode ) {

			this.uStrandMode.value = 0;
			this.uStrandCount.value = 0;
			this.uStrandGapFill.value = 0;
			return;

		}

		const seed = ( this._spawnVariation?.seed ?? p.spawnSeed ?? 0 ) >>> 0;
		const center = this.uHitCenterUVW.value;
		const axis = this.uSeedAxisOS.value;
		const tangent = this.uSeedTangentOS.value;
		const strands = buildStrandSet( {
			params: {
				strandMode: true,
				strandCount: p.strandCount ?? 8,
				strandLength: p.strandLength ?? 0.85,
				strandThickness: p.strandThickness ?? 0.18,
				strandSpacing: p.strandSpacing ?? 0.22,
				strandTwistDeg: p.strandTwistDeg ?? 0,
				strandAngleJitterDeg: p.strandAngleJitterDeg ?? 18,
				strandBend: p.strandBend ?? 0.55,
				strandEdgeSoftness: p.strandEdgeSoftness ?? 0.65,
				strandGapFill: p.strandGapFill ?? 0.12,
				strandRandomAmount: p.strandRandomAmount ?? 1,
				seedShape: p.seedShape || 'sphere',
				shapeThickness: p.shapeThickness ?? 0.28,
				ringRadiusRatio: p.ringRadiusRatio ?? 0.65,
				ringWidth: p.ringWidth ?? 0.22,
				arcAngle: p.arcAngle ?? 140,
				arrowAngle: p.arrowAngle ?? 70,
				arrowLength: p.arrowLength ?? 1,
				columnHeight: p.columnHeight ?? 1.4,
			},
			spawnSeed: seed,
			centerUVW: { x: center.x, y: center.y, z: center.z },
			hitRadiusUVW: this.uHitRadiusUVW.value,
			axis: { x: axis.x, y: axis.y, z: axis.z },
			tangent: { x: tangent.x, y: tangent.y, z: tangent.z },
		} );

		const minR = minStrandRadiusUVW( GRID );
		enforceMinStrandRadii( strands, minR );
		packStrandsToBuffer( strands, this._strandCpuBuf );
		const attr = this.strandBuf.value;
		const gpuArray = attr?.array;
		if ( gpuArray && gpuArray.length >= this._strandCpuBuf.length ) {

			gpuArray.set( this._strandCpuBuf );
			attr.needsUpdate = true;
			attr.version = ( attr.version | 0 ) + 1;

		} else if ( ! this._strandUploadWarned ) {

			this._strandUploadWarned = true;
			console.warn( '[volumeSmoke] strand buffer upload skipped; ropes may look empty' );

		}

		const thickness = p.strandThickness ?? 0.18;
		const hitR = this.uHitRadiusUVW.value;
		this.uStrandMode.value = 1;
		this.uStrandCount.value = strands.length;
		this.uStrandGapFill.value = p.strandGapFill ?? 0.12;
		this.uStrandEdgeSoft.value = p.strandEdgeSoftness ?? 0.65;
		// Thin ropes: boost density; cover ribbon (shader) handles grid hits.
		this.uStrandDensMul.value = strandDensMulForThickness( thickness, hitR, GRID );
		// Halo follows authored thickness only — no survival-floor bloom.
		this.uStrandHaloR.value = Math.max( 1e-4, thickness * hitR * 2.2 );

	}

	/** Hit direction + seedRotation (+ spawnSeed tilt) → shape axis + arc tangent. */
	syncSeedAxis() {

		const base = this.params.seedRotation || { x: 0, y: 0, z: 0 };
		const off = this._spawnVariation?.seedRotationOffset;
		const rot = off
			? {
				x: ( base.x || 0 ) + off.x,
				y: ( base.y || 0 ) + off.y,
				z: ( base.z || 0 ) + off.z,
			}
			: base;

		computeSeedOrientation(
			this.uHitDirOS.value,
			rot,
			this._seedQuat,
			this.uSeedAxisOS.value,
		);
		this.uSeedTangentOS.value.set( 1, 0, 0 ).applyQuaternion( this._seedQuat ).normalize();

	}

	/**
	 * Resize the raymarch AABB and simulation world size (cube, meters).
	 * Does not change world-space smoke seed size — only the activity domain.
	 * @param {number} size
	 */
	setVolumeSize( size ) {

		const s = Math.max( 0.5, size );
		this.params.volumeSize = s;
		this.uVolumeWorldSize.value.set( s, s, s );
		this.mesh.geometry.dispose();
		this.mesh.geometry = new THREE.BoxGeometry( s, s, s );
		this.mesh.updateMatrixWorld( true );
		this.syncHitRadiusUVW();

	}

	/**
	 * @param {boolean} unrestricted open outflow + larger world domain for free outward spread
	 */
	setUnrestricted( unrestricted ) {

		const on = !! unrestricted;
		this.params.unrestricted = on;
		this.uBoundaryLimit.value = on ? 0.0 : 1.0;

		if ( on ) {

			// Remember size used in restricted mode, then enlarge world AABB so smoke can travel farther
			if ( this._sizeBeforeUnrestricted == null ) {

				this._sizeBeforeUnrestricted = this.uVolumeWorldSize.value.x;

			}

			const freeSize = Math.max(
				this.uVolumeWorldSize.value.x,
				this.params.unrestrictedVolumeSize ?? 12,
			);
			this.setVolumeSize( freeSize );

		} else if ( this._sizeBeforeUnrestricted != null ) {

			this.setVolumeSize( this._sizeBeforeUnrestricted );
			this._sizeBeforeUnrestricted = null;

		}

	}

	/**
	 * @param {{
	 *   impulse?: number, density?: number, temperature?: number, radius?: number,
	 *   dirOS?: THREE.Vector3, centerUVW?: THREE.Vector3,
	 *   variation?: object | null,
	 * }} opts
	 * `radius` is world meters (smoke seed size), NOT UVW fraction.
	 * `variation` from buildSpawnVariation(spawnSeed) — same seed → same burst.
	 */
	armSplat( { impulse, density, temperature, radius, dirOS, centerUVW, variation = null } = {} ) {

		this._spawnVariation = variation || null;
		const v = this._spawnVariation;

		if ( v?.noiseOffset ) {

			this.uNoiseOffset.value.set( v.noiseOffset.x, v.noiseOffset.y, v.noiseOffset.z );

		} else {

			this.uNoiseOffset.value.set( 0, 0, 0 );

		}

		this.simulationTime = v?.timePhase ?? 0;
		this.uTime.value = this.simulationTime;

		const dens = density != null ? density : this.params.hitDensity;
		const temp = temperature != null ? temperature : this.params.hitTemperature;
		this.uHitDensity.value = dens * ( v?.densityScale ?? 1 );
		this.uHitTemperature.value = temp * ( v?.temperatureScale ?? 1 );

		if ( radius != null ) this.params.hitRadius = radius;
		this.syncHitRadiusUVW();
		this.syncSeedShape();

		const baseCenter = centerUVW
			? centerUVW.clone()
			: new THREE.Vector3( 0.5, 0.5, 0.5 );
		const seedOff = this.params.seedOffset;
		if ( seedOff ) {

			baseCenter.x += seedOff.x || 0;
			baseCenter.y += seedOff.y || 0;
			baseCenter.z += seedOff.z || 0;

		}
		if ( v?.centerOffsetUVW ) {

			baseCenter.x += v.centerOffsetUVW.x;
			baseCenter.y += v.centerOffsetUVW.y;
			baseCenter.z += v.centerOffsetUVW.z;

		}

		this.uHitCenterUVW.value.copy( baseCenter );
		if ( dirOS ) this.uHitDirOS.value.copy( dirOS ).normalize();
		this.syncSeedAxis();
		this.syncStrandSeed();

		const hitForImpulse = this.uHitDirOS.value;
		const resolved = resolveVolumeSmokeImpulseFromParams( this.params, {
			x: hitForImpulse.x,
			y: hitForImpulse.y,
			z: hitForImpulse.z,
		} );
		this.uImpulseDirOS.value.set( resolved.dirOS.x, resolved.dirOS.y, resolved.dirOS.z );
		this.uImpulseRadial.value = resolved.radial;

		const strength = ( impulse != null ? impulse : this.params.hitImpulse ) * ( v?.impulseScale ?? 1 );
		this.uImpulseActive.value = strength;
		this.uImpulseSwirl.value = this.params.impulseSwirl * ( v?.swirlScale ?? 1 );
		this.uImpulseScaleBox.value = this.params.impulseScaleWithBox ? 1.0 : 0.0;
		this._impulseLeft = Math.max( 1, Math.round( this.params.impulseSubsteps ?? 8 ) );

		this.uDoSplat.value = 1;
		this.active = true;
		this.age = 0;
		this.simAccumulator = 0;
		this.lifePhase = 'alive';
		this.fadeAge = 0;
		this.peakDensity = Number.POSITIVE_INFINITY;
		this._densitySampleReady = false;
		this._densityReadPending = false;
		this._densityFrame = 0;
		this._splatDone = false;
		this.uFadeMul.value = 1;
		this.mesh.visible = true;

	}

	/**
	 * Spawn frame: inject dye first, then advect velocity (with multi-step impulse),
	 * project, then advect dye so smoke actually rides the kick.
	 */
	stepOneSubstep( pressureIterations = PRESSURE_ITERATIONS ) {

		let iters = pressureIterations;
		iters = Math.max( 2, Math.floor( iters / 2 ) * 2 );

		// 1) Put smoke in the field BEFORE forces / advection on the spawn substep
		if ( this.uDoSplat.value > 0.5 ) {

			this.renderer.compute( this.splatHitDyePass );
			const t0 = this.dyeTexNode.value;
			this.dyeTexNode.value = this.dyeTexWriteNode.value;
			this.dyeTexWriteNode.value = t0;
			this.uDoSplat.value = 0;
			this._splatDone = true;

		}

		// 2) Advect velocity (+ hit impulse inside) → velTexB
		this.renderer.compute( this.advectVelocityPass );
		this.renderer.compute( this.divergencePass );

		for ( let i = 0; i < iters; i ++ ) {

			this.renderer.compute( ( i % 2 === 0 ) ? this.jacobiPassAB : this.jacobiPassBA );

		}

		this.renderer.compute( this.projectPass ); // velB - ∇p → velA
		this.renderer.compute( this.advectDyePass );

		{

			const t = this.dyeTexNode.value;
			this.dyeTexNode.value = this.dyeTexWriteNode.value;
			this.dyeTexWriteNode.value = t;

		}

		// 3) Decay multi-frame impulse
		if ( this._impulseLeft > 0 ) {

			this._impulseLeft -= 1;
			if ( this._impulseLeft <= 0 ) this.uImpulseActive.value = 0;

		}

		this.age += this.uDt.value;

	}

	/**
	 * Fixed-dt accumulator — official animate() pattern.
	 * @param {number} realDelta
	 * @param {object} [simParams]
	 */
	stepSimulation( realDelta, simParams = {} ) {

		const p = { ...this.params, ...simParams };
		Object.assign( this.params, p );

		if ( ! this.active || ! p.simulate || ! ( p.simSpeed > 0 ) ) return;

		// smokeLifespan always drives dye dissipation; maxLife only ends in lifespan mode.
		if ( p.endCondition === 'density' ) {

			this.maxLife = Number.POSITIVE_INFINITY;

		} else {

			this.maxLife = p.smokeLifespan;

		}

		const delta = Math.min( realDelta, 1 / 30 );
		this.simAccumulator += delta * p.simSpeed;

		const hz = p.fixedSubstepsHz ?? 120;
		const simStep = ( 1 / hz ) * p.simSpeed;
		const maxAccumulator = simStep * 8;
		if ( this.simAccumulator > maxAccumulator ) this.simAccumulator = maxAccumulator;

		this.uDt.value = simStep;
		this.uTurbulence.value = p.simSpeed > 0 ? p.turbulence / Math.sqrt( p.simSpeed ) : 0;
		this.uBuoyancy.value = p.buoyancy;
		this.uWeight.value = p.weight;
		this.uTurbulenceDecay.value = p.turbulenceDecay;
		this.uTurbFrequency.value = p.turbFrequency;
		this.uTurbulenceBias.value = p.turbulenceBias ?? 0;
		{

			const dir = p.turbulenceDir ?? { x: 0, y: 1, z: 0 };
			const dx = dir.x ?? 0;
			const dy = dir.y ?? 0;
			const dz = dir.z ?? 0;
			const len = Math.hypot( dx, dy, dz );
			if ( len > 1e-6 ) {

				this.uTurbulenceDir.value.set( dx / len, dy / len, dz / len );

			} else {

				this.uTurbulenceDir.value.set( 0, 1, 0 );

			}

		}
		this.uVelDamping.value = p.velDamping;
		this.uShadowAbsorption.value = p.shadowAbsorption;
		this.uShadowAmbient.value = p.shadowAmbient;
		this.uPowderStrength.value = p.powderStrength;
		this.uMultiScattering.value = p.multiScattering;
		this.uAsymmetry.value = p.phaseAsymmetry;
		this.uDensityGain.value = p.densityGain;
		this.uSmokeColor.value.set( p.smokeColor );
		this.params.hitRadius = p.hitRadius;
		if ( p.seedShape != null ) this.params.seedShape = p.seedShape;
		if ( p.shapeThickness != null ) this.params.shapeThickness = p.shapeThickness;
		if ( p.ringRadiusRatio != null ) this.params.ringRadiusRatio = p.ringRadiusRatio;
		if ( p.ringWidth != null ) this.params.ringWidth = p.ringWidth;
		if ( p.arcAngle != null ) this.params.arcAngle = p.arcAngle;
		if ( p.arrowAngle != null ) this.params.arrowAngle = p.arrowAngle;
		if ( p.arrowLength != null ) this.params.arrowLength = p.arrowLength;
		if ( p.columnHeight != null ) this.params.columnHeight = p.columnHeight;
		if ( p.seedRotation != null ) this.params.seedRotation = p.seedRotation;
		if ( p.seedOffset != null ) this.params.seedOffset = p.seedOffset;
		this.syncHitRadiusUVW();
		this.syncSeedShape();
		if ( p.impulseMode != null ) this.params.impulseMode = p.impulseMode;
		if ( p.impulseDirSource != null ) this.params.impulseDirSource = p.impulseDirSource;
		if ( p.impulseDir != null ) {

			const d = p.impulseDir;
			this.params.impulseDir = { x: d.x || 0, y: d.y || 0, z: d.z || 0 };

		}
		if ( p.showImpulseDir != null ) this.params.showImpulseDir = !! p.showImpulseDir;
		if ( p.impulseRadial != null ) this.params.impulseRadial = p.impulseRadial;
		if (
			p.impulseMode != null ||
			p.impulseDirSource != null ||
			p.impulseDir != null ||
			p.impulseRadial != null
		) {

			const hit = this.uHitDirOS.value;
			const resolved = resolveVolumeSmokeImpulseFromParams( this.params, {
				x: hit.x, y: hit.y, z: hit.z,
			} );
			this.uImpulseDirOS.value.set( resolved.dirOS.x, resolved.dirOS.y, resolved.dirOS.z );
			this.uImpulseRadial.value = resolved.radial;

		}
		if ( p.impulseSwirl != null ) {

			const swirlScale = this._spawnVariation?.swirlScale ?? 1;
			this.uImpulseSwirl.value = p.impulseSwirl * swirlScale;

		}

		if ( p.impulseScaleWithBox != null ) this.uImpulseScaleBox.value = p.impulseScaleWithBox ? 1.0 : 0.0;
		if ( p.velDisplayWarp != null ) this.uVelDisplayWarp.value = p.velDisplayWarp;
		this.volumetricMaterial.steps = p.raymarchSteps ?? this.volumetricMaterial.steps;

		// Only sync the boundary uniform here — domain resize is GUI-driven via setUnrestricted()
		if ( p.unrestricted != null ) {

			this.params.unrestricted = !! p.unrestricted;
			this.uBoundaryLimit.value = p.unrestricted ? 0.0 : 1.0;

		}

		if ( p.smokeLifespan >= 100.0 ) {

			this.uDissipation.value = 0.0;

		} else {

			this.uDissipation.value = 1.0 / p.smokeLifespan;

		}

		this.uCooling.value = 1.0 / p.tempLifespan;

		let pressureIterations = p.pressureIterations ?? PRESSURE_ITERATIONS;
		pressureIterations = Math.max( 2, Math.floor( pressureIterations / 2 ) * 2 );

		while ( this.simAccumulator >= simStep ) {

			this.simulationTime += simStep;
			this.uTime.value = this.simulationTime;
			this.stepOneSubstep( pressureIterations );
			this.simAccumulator -= simStep;

		}

		const endCondition = p.endCondition === 'density' ? 'density' : 'lifespan';
		const fadeOutSec = Math.max( 0, p.fadeOutSec ?? 0.3 );
		const fadeCurve = p.fadeCurve || 'easeOut';
		const densityStop = p.densityStop ?? 0.02;

		if ( endCondition === 'density' && this.lifePhase === 'alive' && this._splatDone ) {

			this._densityFrame += 1;
			if ( this._densityFrame % 3 === 0 ) this._requestPeakDensitySample();

		}

		if ( this.lifePhase === 'alive' ) {

			const shouldFade = volumeSmokeShouldBeginFade( {
				endCondition,
				age: this.age,
				maxLife: this.maxLife,
				densityStop,
				peakDensity: this.peakDensity,
				densitySampleReady: this._densitySampleReady,
			} );
			if ( shouldFade ) {

				this.lifePhase = 'fading';
				this.fadeAge = 0;
				if ( fadeOutSec <= 1e-6 ) {

					this.uFadeMul.value = 0;
					this.resetImmediate();
					return;

				}

			}

		}

		if ( this.lifePhase === 'fading' ) {

			this.fadeAge += realDelta * ( p.simSpeed > 0 ? 1 : 0 );
			// Wall-clock fade (not sim-scaled) so duration matches the UI seconds.
			const t = fadeOutSec > 1e-6 ? this.fadeAge / fadeOutSec : 1;
			this.uFadeMul.value = volumeSmokeFadeMul( t, fadeCurve );
			if ( t >= 1 ) this.resetImmediate();

		}

	}

	/** Kick async GPU max(dye.r) readback for density endCondition. */
	_requestPeakDensitySample() {

		if ( this._densityReadPending || ! this.active ) return;
		this._densityReadPending = true;
		try {

			this.renderer.compute( this.clearPeakDensityPass );
			this.renderer.compute( this.reducePeakDensityPass );
			const attr = this.peakDensityBits.value;
			void this.renderer.getArrayBufferAsync( attr ).then( ( buf ) => {

				this._densityReadPending = false;
				if ( ! this.active ) return;
				const bits = new Uint32Array( buf )[ 0 ] >>> 0;
				const f32 = new Float32Array( new Uint32Array( [ bits ] ).buffer )[ 0 ];
				this.peakDensity = Number.isFinite( f32 ) ? f32 : 0;
				this._densitySampleReady = true;

			} ).catch( () => {

				this._densityReadPending = false;

			} );

		} catch ( err ) {

			this._densityReadPending = false;
			if ( ! this._peakDensityWarned ) {

				this._peakDensityWarned = true;
				console.warn( '[volumeSmoke] peak density reduce failed; density endCondition may stall', err );

			}

		}

	}

	/**
	 * Instantly hide + zero all fluid fields (sync compute).
	 * Use when reclaiming a pool slot so old smoke does not overlap the new burst.
	 */
	resetImmediate() {

		this.active = false;
		this.age = 0;
		this.simAccumulator = 0;
		this.simulationTime = 0;
		this.lifePhase = 'alive';
		this.fadeAge = 0;
		this.peakDensity = 0;
		this._densitySampleReady = false;
		this._densityReadPending = false;
		this._densityFrame = 0;
		this._splatDone = false;
		this._spawnVariation = null;
		this.uNoiseOffset.value.set( 0, 0, 0 );
		this.uDoSplat.value = 0;
		this.uImpulseActive.value = 0;
		this.uFadeMul.value = 1;
		this._impulseLeft = 0;
		this.mesh.visible = false;

		this.dyeTexNode.value = this.dyeTexA;
		this.dyeTexWriteNode.value = this.dyeTexB;

		for ( const pass of this.zeroFillPasses ) {

			this.renderer.compute( pass );

		}

	}

	/** Async variant (e.g. init / teardown). Prefer resetImmediate for pool reclaim. */
	async reset() {

		this.resetImmediate();

	}

	dispose() {

		this.mesh.geometry.dispose();
		this.volumetricMaterial.dispose();
		const textures = [
			this.velTexA, this.velTexB, this.dyeTexA, this.dyeTexB,
			this.divTex, this.pressTexA, this.pressTexB, this.curlNoiseTex,
		];
		for ( const t of textures ) t.dispose();

	}

}
