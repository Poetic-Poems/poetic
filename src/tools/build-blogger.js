#!/usr/bin/env node
/**
 * Build script to inject CSS from public/poetic.css and public/custom.css into
 * fragments-and-unity.template.html.
 * Replaces content between CUSTOM CSS START and CUSTOM CSS END delimiters.
 */

const fs = require("fs");
const path = require("path");

function injectCSSIntoTemplate() {
  try {
    const publicDir = path.join(process.cwd(), "public");
    const templatePath = path.join(publicDir, "fragments-and-unity.template.html");

    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      console.error("Error: Template file not found at", templatePath);
      process.exit(1);
    }

    // Read the template and concatenate poetic.css + custom.css
    const templateContent = fs.readFileSync(templatePath, "utf8");
    let stylesContent = "";
    for (const file of ["poetic.css", "custom.css"]) {
      const filePath = path.join(publicDir, file);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, "utf8").trim();
      if (content) stylesContent += (stylesContent ? "\n\n" : "") + content;
    }
    if (!stylesContent) {
      console.error("Error: No CSS found in public/poetic.css or public/custom.css");
      process.exit(1);
    }

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
    console.log(`🎨 Styles: public/poetic.css + public/custom.css`);

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
