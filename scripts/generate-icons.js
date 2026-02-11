const sharp = require('sharp');
const path = require('path');

const imagesDir = path.join(__dirname, '..', 'public', 'images');

const sizes = [192, 512];

async function generateIcons() {
    for (const size of sizes) {
        const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.15)}" fill="#2563eb"/>
  <text x="${size/2}" y="${size * 0.68}" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="${Math.round(size * 0.55)}" font-weight="bold">U</text>
</svg>`);

        await sharp(svg)
            .resize(size, size)
            .png()
            .toFile(path.join(imagesDir, `icon-${size}x${size}.png`));

        console.log(`Generated icon-${size}x${size}.png`);
    }
    console.log('All PWA icons generated!');
}

generateIcons().catch(console.error);
