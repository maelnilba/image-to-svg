const { writeFileSync } = require("fs");
const Jimp = require("jimp");
const {
  Bitmap,
  ImageRunner,
  ShapeTypes,
  SvgExporter,
  ShapeJsonExporter,
} = require("geometrizejs");
const images = require("images");

function deltaE(rgbA, rgbB) {
  let labA = rgb2lab(rgbA);
  let labB = rgb2lab(rgbB);
  let deltaL = labA[0] - labB[0];
  let deltaA = labA[1] - labB[1];
  let deltaB = labA[2] - labB[2];
  let c1 = Math.sqrt(labA[1] * labA[1] + labA[2] * labA[2]);
  let c2 = Math.sqrt(labB[1] * labB[1] + labB[2] * labB[2]);
  let deltaC = c1 - c2;
  let deltaH = deltaA * deltaA + deltaB * deltaB - deltaC * deltaC;
  deltaH = deltaH < 0 ? 0 : Math.sqrt(deltaH);
  let sc = 1.0 + 0.045 * c1;
  let sh = 1.0 + 0.015 * c1;
  let deltaLKlsl = deltaL / 1.0;
  let deltaCkcsc = deltaC / sc;
  let deltaHkhsh = deltaH / sh;
  let i =
    deltaLKlsl * deltaLKlsl + deltaCkcsc * deltaCkcsc + deltaHkhsh * deltaHkhsh;
  return i < 0 ? 0 : Math.sqrt(i);
}

function rgb2lab(rgb) {
  let r = rgb[0] / 255,
    g = rgb[1] / 255,
    b = rgb[2] / 255,
    x,
    y,
    z;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
  z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  x = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116;
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116;
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116;
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const TransformToSVG = async (path, delta, color) => {
  await Jimp.read(path, (err, image) => {
    if (err) throw console.error(err);

    const bitmap = Bitmap.createFromByteArray(
      image.bitmap.width,
      image.bitmap.height,
      image.bitmap.data
    );

    const shapes = [[ShapeTypes.CIRCLE], [ShapeTypes.TRIANGLE]];
    const runner = new ImageRunner(bitmap);
    let options = {
      shapeTypes: shapes[0],
      candidateShapesPerStep: 500,
      shapeMutationsPerStep: 300,
      alpha: 255,
    };
    const iterations = 5000;
    const svgData = [];

    for (let i = 0; i < iterations; i++) {
      if (i === 100) {
        options.shapeTypes = shapes[1];
      }
      process.stdout.write(
        "Convert is " + Math.floor((i * 100) / iterations) + "% complete... \r"
      );
      let r = runner.step(options);
      let jsexp = JSON.parse(ShapeJsonExporter.exportShapes(r));
      let exp = SvgExporter.exportShapes(r);

      const diff = deltaE(color, jsexp.color);
      if (diff > delta - 5) {
        svgData.push(exp);
      }
    }
    const svg =
      SvgExporter.getSvgPrelude() +
      SvgExporter.getSvgNodeOpen(bitmap.width, bitmap.height) +
      svgData.join("\n") +
      SvgExporter.getSvgNodeClose();
    let outpath = path.substring(1, path.length).split(".")[0];
    writeFileSync(`./output/${outpath}.svg`, svg);
  });
};

const getBackgroundColor = async (path) => {
  const image = await Jimp.read(path);
  const bitmap = Bitmap.createFromByteArray(
    image.bitmap.width,
    image.bitmap.height,
    image.bitmap.data
  );
  const runner = new ImageRunner(bitmap);
  const options = {
    shapeTypes: [ShapeTypes.TRIANGLE, ShapeTypes.CIRCLE, ShapeTypes.RECTANGLE],
    candidateShapesPerStep: 50,
    shapeMutationsPerStep: 100,
    alpha: 255,
  };
  const iterations = 500;
  const colorsData = [];

  for (let i = 0; i < iterations; i++) {
    process.stdout.write(
      "Getting background color " +
        Math.floor((i * 100) / iterations) +
        "% complete... \r"
    );
    let r = runner.step(options);
    let jsexp = JSON.parse(ShapeJsonExporter.exportShapes(r));
    let colorA = [jsexp.color[0], jsexp.color[1], jsexp.color[2]];
    colorsData.push(colorA);
  }

  const [BestColor, delta] = getBackground(colorsData);
  return {
    color: BestColor,
    delta,
    width: image.bitmap.width,
    height: image.bitmap.height,
  };
};

const getBackground = (colorsData) => {
  console.log("Process to get the better background color ");
  let minDelta = 50;
  let find = false;
  let findedColor = [0, 0, 0];
  let tryColor = new Color();

  while (!find) {
    let isGood = true;

    for (let i = 0; i < colorsData.length; i++) {
      if (deltaE(tryColor.rgb, colorsData[i]) < minDelta) {
        isGood = false;
        tryColor.increment();
        break;
      }
    }
    if (isGood) {
      findedColor = tryColor.rgb;
      find = true;
    } else if (tryColor.reachMax) {
      minDelta = minDelta - 10;
      tryColor.reset();
    }
  }

  return [findedColor, minDelta];
};

class Color {
  constructor() {
    this.c = 0;
  }

  get reachMax() {
    return this.c >= 16777216;
  }

  reset() {
    this.c = 0;
  }

  get rgb() {
    return this.numberToColour(this.c);
  }

  increment() {
    if (this.c < 16777216) {
      this.c = this.c + 1;
    }
  }

  numberToColour(number) {
    const r = (number & 0xff0000) >> 16;
    const g = (number & 0x00ff00) >> 8;
    const b = number & 0x0000ff;

    return [b, g, r];
  }
}

(async () => {
  const path = "dofusoeuf.png";
  const { color, delta, width, height } = await getBackgroundColor(path);
  images(width, height)
    .fill(color[0], color[1], color[2])
    .draw(images(path), 0, 0)
    .save(`bg_${path}`, { quality: 100 });

  await TransformToSVG(`bg_${path}`, delta, color);
})();

// console.log(deltaE([123, 158, 150], [101, 0, 252]));
