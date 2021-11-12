const { writeFileSync, unlinkSync } = require("fs");
const cliProgress = require("cli-progress");
const Jimp = require("jimp");
const {
  Bitmap,
  ImageRunner,
  ShapeTypes,
  SvgExporter,
  ShapeJsonExporter,
} = require("geometrizejs");
const images = require("images");
const { Color, deltaE } = require("./utils/Color");

const TransformToSVG = async (path, delta, color) => {
  try {
    const image = await Jimp.read(path);
    const barprogress = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );

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
    barprogress.start(iterations, 1);

    for (let i = 0; i < iterations; i++) {
      barprogress.update(i + 1);
      if (i === 100) {
        options.shapeTypes = shapes[1];
      }
      let r = runner.step(options);
      let jsexp = JSON.parse(ShapeJsonExporter.exportShapes(r));
      let exp = SvgExporter.exportShapes(r);

      if (delta) {
        const diff = deltaE(color, jsexp.color);
        if (diff > delta - 5) {
          svgData.push(exp);
        }
      } else {
        svgData.push(exp);
      }
    }
    const svg =
      SvgExporter.getSvgPrelude() +
      SvgExporter.getSvgNodeOpen(bitmap.width, bitmap.height) +
      svgData.join("\n") +
      SvgExporter.getSvgNodeClose();
    let outpath = delta
      ? path.substring(3, path.length).split(".")[0]
      : path.split(".")[0];
    writeFileSync(`./output/${outpath}.svg`, svg);
    if (delta) {
      unlinkSync(path);
    }
    barprogress.stop();
  } catch (error) {
    throw "path doesn't exist";
  }
};

const getBackgroundColor = async (path) => {
  const barprogress = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic
  );
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
  barprogress.start(iterations, 1);

  for (let i = 0; i < iterations; i++) {
    barprogress.update(i + 1);
    let r = runner.step(options);
    let jsexp = JSON.parse(ShapeJsonExporter.exportShapes(r));
    let colorA = [jsexp.color[0], jsexp.color[1], jsexp.color[2]];
    colorsData.push(colorA);
  }

  barprogress.stop();
  const [BestColor, delta] = getBackground(colorsData);
  return {
    color: BestColor,
    delta,
    width: image.bitmap.width,
    height: image.bitmap.height,
  };
};

const getBackground = (colorsData) => {
  let minDelta = 50;
  let find = false;
  let findedColor = [0, 0, 0];
  let tryColor = new Color();
  process.stdout.write(
    "Processing to get the best color match, may take a while... \r"
  );

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

const ConvertImgToSvg = async (path) => {
  let extension = path.split(".")[1];
  if (extension === "png") {
    const { color, delta, width, height } = await getBackgroundColor(path);
    images(width, height)
      .fill(color[0], color[1], color[2])
      .draw(images(path), 0, 0)
      .save(`bg_${path}`, { quality: 100 });

    await TransformToSVG(`bg_${path}`, delta, color);
  } else if (extension === "jpg" || extension === "jpeg") {
    await TransformToSVG(path, 0, 0);
  }
};

module.exports = ConvertImgToSvg;
