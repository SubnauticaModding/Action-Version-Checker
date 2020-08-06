const core = require("@actions/core");
const github = require("@actions/github");

const fs = require("fs");
const MultiRegExp2 = require("multi-regexp2");
const { start } = require("repl");

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
 * This function turns a custom string into a dictionary
 * @example 
 * // Example of YAML syntax
 * with: 
 *   files: |
 *     QModManager/Properties/AssemblyInfo.cs | /\[assembly: AssemblyVersion\("v([0-9.]+)"\)\]/g
 *     Installer/QModsInstallerScript.iss     | /version: "v([0-9.]+)"/g
 *     Data/latest-version.txt                | /([0-9.]+)/g
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
 * This function turns the dictionary returned by `getDictionary(string)` into an array of annotations which can be understood by the `Attest/annotations-action` action
 * @param {{[file: string]: string}} dict 
 * @returns {{message: "This version number doesn't match other ones.", path: string, column: {start: number, end: number}, line: {start: number, end: number}, level: "failure", text: string}[]}
 */
function getAnnotations(dict) {
  const output = [];
  for (const file in dict) { // For each file in the dictionary
    const contents = fs.readFileSync("./" + file, "utf-8"); // Read file's contents
    contents.split(/[\n\r]+/g).forEach((line, index) => { // For each line in the file
      for (const regexText of dict[file]) { // For each regex in the dictionary
        /** @type {RegExp} */
        var regex;
        eval("regex = " + regexText);
        const regex2 = new MultiRegExp2(regex);
        const matches = [...line.matchAll(regex)]; // Match the regex on the line
        for (const match of matches) { // For each match
          if (match[1]) { // If match is valid
            /** @type {{match:string,start:number,end:number}} */
            const indexMatch = regex2.execForGroup(match[0], 1);
            output.push({ // Output match
              "message": "Version numbers don't match.\n\nThere are:",
              "path": file,
              "column": {
                "start": match.index + indexMatch.start,
                "end": match.index + match[0].length + indexMatch.start,
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
 * This function appends the number of occurrences of each version to the message of the annotations
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
      annotation.message += `\n- ${count[version]} occurrence${count[version] == 1 ? "" : "s"} of "${version}"`; // TODO: Sort this with a custom version comparer or by count
    }
  }
}