const core = require("@actions/core");
const github = require("@actions/github");

const fs = require("fs");
const MultiRegExp2 = require("multi-regexp2").default;
const path = require("path");

try {
  console.log("Examining PR branch files...");

  const text = core.getInput("files", { required: true });
  const dictionary = getDictionary(text);
  const annotations = getAnnotations(dictionary);
  const versions = annotations.map(x => x.text);
  addCount(annotations, versions);

  if (versions.length == 0) {
    console.log("No versions found on PR branch.");
    return;
  }

  core.setOutput("annotations_path", "./annotations.json");
  core.setOutput("failed_check_path", "./failed.txt");

  if (versions.filter(x => x == versions[0]).length != versions.length) {
    console.log("The version numbers on the PR branch don't match!");
    console.log(versions);
    console.log(annotations);
    fs.writeFileSync("./annotations.json", JSON.stringify(annotations));
    fs.writeFileSync("./failed.txt", "1");
    return;
  } else {
    console.log("The version numbers on the PR branch match.");
    console.log(versions);
    fs.writeFileSync("./annotations.json", "[]");
  }

  console.log("Examining master branch files...");

  const masterPath = core.getInput("master_repo_path");
  if (!masterPath) {
    console.log("No master branch path set. Skipping master check.");
    return;
  }

  const masterAnnotations = getAnnotations(dictionary, masterPath);
  const masterVersions = masterAnnotations.map(x => x.text);

  if (masterVersions.length == 0) {
    console.log("No versions found on master branch. Skipping master check.");
    return;
  }

  if (masterVersions.filter(x => x == masterVersions[0]).length != masterVersions.length) {
    console.log("The version numbers on the master branch don't match! Skipping master check.");
    return;
  }

  if (versions[0] == masterVersions[0]) {
    console.log("PR branch version is the same as master branch version!");
    console.log(versions[0]);
    setSameAsMaster(annotations, versions[0]);
    fs.writeFileSync("./annotations.json", JSON.stringify(annotations));
    fs.writeFileSync("./failed.txt", "1");
    return;
  } else {
    console.log("PR branch version is not the same as the master branch version.");
    console.log(`PR: ${versions[0]}, MASTER: ${masterVersions[0]}`);
    fs.writeFileSync("./annotations.json", "[]");
  }
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
 * @param {string} _path
 * @returns {{message: string, path: string, column: {start: number, end: number}, line: {start: number, end: number}, level: "failure", text: string}[]}
 */
function getAnnotations(dict, _path = ".") {
  const output = [];
  for (const file in dict) { // For each file in the dictionary
    const contents = fs.readFileSync(path.join(_path, file), "utf-8"); // Read file's contents
    contents.split(/[\n\r]+/g).forEach((line, index) => { // For each line in the file
      for (const regexText of dict[file]) { // For each regex in the dictionary
        /** @type {RegExp} */
        var regex;
        eval("regex = " + regexText); // Directly obtain the regex from the string without worrying about escaping stuff
        const regex2 = new MultiRegExp2(regex);
        const matches = [...line.matchAll(regex)]; // Match the regex on the line
        for (const match of matches) { // For each match
          if (match[1]) { // If match is valid
            /** @type {{match:string,start:number,end:number}} */
            const indexMatch = regex2.execForGroup(match[0], 1); // Get the starting index of the first group, i.e. the version
            output.push({ // Output match
              "message": "Version numbers don't match.\n\nThere are:",
              "path": file,
              "column": {
                "start": match.index + indexMatch.start, // The start of the first group, i.e. the version
                "end": match.index + match[1].length + indexMatch.start, // The end of the first group, i.e. the version
              },
              "line": {
                "start": index + 1, // The line of the match
                "end": index + 1,
              },
              "level": "failure",
              "text": match[1], // The first group of the match, i.e. the version
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
 * @param {{message: string, path: string, column: {start: number, end: number}, line: {start: number, end: number}, level: "failure", text: string}[]} annotations 
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

/**
 * This function changes the message of the annotations to specify that the version is the same as the master version
 * @param {{message: string, path: string, column: {start: number, end: number}, line: {start: number, end: number}, level: "failure", text: string}[]} annotations 
 * @param {string} version 
 */
function setSameAsMaster(annotations, version) {
  for (const annotation of annotations) {
    annotation.message = `The version number is the same as the master branch! (${version})`;
  }
}