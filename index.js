const core = require("@actions/core");
const github = require("@actions/github");

const fs = require("fs");

try {
  console.log("Examining files...");

  const text = core.getInput("files");
  const dictionary = getDictionary(text);
  const annotations = getAnnotations(dictionary);
  const versions = annotations.filter(x => x.text);

  if (versions.length == 0) return;

  if (versions.filter(x => x == versions[0]).length != versions.length) {
    fs.writeFileSync("./annotations.json", JSON.stringify(annotations));
  } else {
    fs.writeFileSync("./annotations.json", "[]");
  }
} catch (error) {
  core.setFailed("An error has occurred: " + error.message);
}

/**
 * @param {string} text 
 * @returns {{[file: string]: string}}
 */
function getDictionary(text) {
  const results = {};
  const lines = text.split(/[\n\r]+/g);
  for (const line of lines) {
    const file = line.split("|")[0].trim();
    const regex = line.split("|")[1].trim();

    if (!results[file]) results[file] = [];
    results[file].push(regex);
  }
  return results;
}

/**
 * @param {{[file: string]: string}} dict 
 * @returns {{message: "This version number doesn't match other ones.", path: string, column: {start: number, end: number}, line: {start: number, end: number}, level: "warning", text: string}[]}
 */
function getAnnotations(dict) {
  const output = [];
  for (const file in dict) { // For each file in the dictionary
    const contents = fs.readFileSync("./" + file, "utf-8"); // Read file's contents
    contents.split(/[\n\r]+/g).forEach((line, index) => { // For each line in the file
      for (const regexText of dict[file]) { // For each regex in the dictionary
        var regex;
        eval("regex = " + regexText);
        const matches = [...line.matchAll(regex)]; // Match the regex on the line
        for (const match of matches) { // For each match
          if (match[1]) { // If match is valid
            output.push({ // Output match
              "message": "This version number doesn't match other ones.",
              "path": file,
              "column": {
                "start": match.index,
                "end": match.index + match[0].length,
              },
              "line": {
                "start": index + 1,
                "end": index + 1,
              },
              "level": "warning",
              "text": match[0],
            });
          }
        }
      }
    });
  }
  return output;
}