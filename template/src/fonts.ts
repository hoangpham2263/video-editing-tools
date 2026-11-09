import {loadFont as loadItim} from '@remotion/google-fonts/Itim';
import {loadFont as loadLora} from '@remotion/google-fonts/Lora';

// Tiêu đề: chữ tròn nét mảnh như mẫu. Phụ đề: chữ có chân, đậm.
export const titleFont = loadItim('normal', {
  weights: ['400'],
  subsets: ['latin', 'vietnamese'],
}).fontFamily;

export const captionFont = loadLora('normal', {
  weights: ['700'],
  subsets: ['latin', 'vietnamese'],
}).fontFamily;
