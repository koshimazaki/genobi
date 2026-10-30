import { construct } from './construction.js';
import { installClock } from './clock.js';
window.dispatchEvent(new CustomEvent('genobi-construction-ready', {
  detail: { construct, installClock },
}));
