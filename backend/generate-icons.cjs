/**
 * PWA Icon Generator
 * Generates PNG icons from the base SVG icon
 *
 * Run: node generate-icons.js
 * Requires: sharp (npm install sharp)
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.log('Sharp not installed. Install it with: npm install sharp');
    console.log('Then run this script again.');
    console.log('\nAlternatively, use an online SVG to PNG converter:');
    console.log('1. Open public/assets/icons/icon.svg in a browser');
    console.log('2. Use https://svgtopng.com/ or similar');
    console.log('3. Generate these sizes: 72, 96, 128, 144, 152, 192, 384, 512');
    console.log('4. Save them as icon-[SIZE].png in public/assets/icons/');
    process.exit(1);
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const inputPath = path.join(__dirname, 'public', 'assets', 'icons', 'icon.svg');
const outputDir = path.join(__dirname, 'public', 'assets', 'icons');

async function generateIcons() {
    console.log('Generating PWA icons...\n');

    // Read SVG
    const svgBuffer = fs.readFileSync(inputPath);

    for (const size of sizes) {
        const outputPath = path.join(outputDir, `icon-${size}.png`);

        await sharp(svgBuffer)
            .resize(size, size)
            .png()
            .toFile(outputPath);

        console.log(`Created: icon-${size}.png`);
    }

    console.log('\nAll icons generated successfully!');
}

generateIcons().catch(err => {
    console.error('Error generating icons:', err);
    process.exit(1);
});
