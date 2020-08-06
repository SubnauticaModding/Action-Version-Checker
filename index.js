const core = require("@actions/core");
const github = require("@actions/github");

const fs = require("fs");

try {
  console.log("Examining files...");

  const text = core.getInput("files");
  const dictionary = getDictionary(text);
  const annotations = getAnnotations(dictionary);
  const versions = annotations.map(x => x.text);
  addCount(annotations, versions);

  if (versions.length == 0) return;

  if (versions.filter(x => x == versions[0]).length != versions.length) {
    console.log("The version numbers don't match!");
    console.log(versions);
    fs.writeFileSync("./annotations.json", JSON.stringify(annotations));
    fs.writeFileSync("./failed.txt", "1");
  } else {
    console.log("The version numbers match.");
    console.log(versions);
    fs.writeFileSync("./annotations.json", "[]");
  }

  // TODO: Make sure version number isn't the same as master
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
 * @returns {{message: "This version number doesn't match other ones.", path: string, column: {start: number, end: number}, line: {start: number, end: number}, level: "failure", text: string}[]}
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
              "message": "Version numbers don't match.\n\nThere are:",
              "path": file,
              "column": {
                "start": match.index, // The start of the match // TODO: Make it show the start of the first group 
                "end": match.index + match[0].length, // The end of the match // TODO: Make it show the end of the first group
              },
              "line": {
                "start": index + 1, // The line of the match
                "end": index + 1,
              },
              "level": "failure",
              "text": match[1], // The first group of the match
            });
          }
        }
      }
    });
  }
  return output;
}

/**
 * @param {{message: "This version number doesn't match other ones.", path: string, column: {start: number, end: number}, line: {start: number, end: number}, level: "failure", text: string}[]} annotations 
 * @param {string[]} versions 
 */
function addCount(annotations, versions) {
  const count = {};
  for (const version of versions) {
    if (!count[version]) count[version] = 0;
    count[version]++;
  }

  for (const annotation of annotations) {
    for (const version in count) {
      annotation.message += `\n- ${count[version]} occurrences of "${version}"`; // TODO: Sort this with a custom version comparer
    }
  }
}