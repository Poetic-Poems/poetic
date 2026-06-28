#!/usr/bin/env node
/**
 * Build script to inject CSS from public/styles.css into fragments-and-unity.template.html
 * Replaces content between CUSTOM CSS START and CUSTOM CSS END delimiters
 */

const fs = require("fs");
const path = require("path");

function injectCSSIntoTemplate() {
  try {
    const templatePath = path.join(process.cwd(), "public", "fragments-and-unity.template.html");
    const stylesPath = path.join(process.cwd(), "public", "styles.css");

    // Check if files exist
    if (!fs.existsSync(templatePath)) {
      console.error("Error: Template file not found at", templatePath);
      process.exit(1);
    }

    if (!fs.existsSync(stylesPath)) {
      console.error("Error: Styles file not found at", stylesPath);
      process.exit(1);
    }

    // Read the template and styles
    const templateContent = fs.readFileSync(templatePath, "utf8");
    const stylesContent = fs.readFileSync(stylesPath, "utf8");

    // Create the regex pattern to match the CSS section
    const cssPattern = /(\/\* ~~ CUSTOM CSS START ~~ \*\/)([\s\S]*?)(\/\* ~~ CUSTOM CSS END ~~ \*\/)/;

    // Check if the delimiters exist
    if (!cssPattern.test(templateContent)) {
      console.error("Error: CSS delimiters not found in template file");
      process.exit(1);
    }

    // Replace the content between delimiters
    const updatedContent = templateContent.replace(
      cssPattern,
      `$1\n\n${stylesContent.trim()}\n\n$3`
    );

    // Write the updated template back to file
    fs.writeFileSync(templatePath, updatedContent, "utf8");

    console.log("✅ Successfully injected CSS into template");
    console.log(`📁 Template: ${templatePath}`);
    console.log(`🎨 Styles: ${stylesPath}`);

  } catch (err) {
    console.error("Error injecting CSS:", err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  injectCSSIntoTemplate();
}

module.exports = {
  injectCSSIntoTemplate,
};
