import './styles.css';
import { SfxLabApp } from './ui/SfxLabApp';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app missing');

const app = new SfxLabApp(root);
void app.start();
