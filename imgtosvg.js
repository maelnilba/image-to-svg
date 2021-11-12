const { program } = require("commander");
const ConvertImgToSvg = require("./src");
program.version("0.0.1");

program
  .command("c <path>")
  .description("convert an image in a svg")
  .action((path) => {
    ConvertImgToSvg(path);
  });

program.parse(process.argv);
