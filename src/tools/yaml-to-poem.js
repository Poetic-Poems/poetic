#!/usr/bin/env node
/**
 * Convert YAML poem files to .poem format
 * Reverse conversion of poem-to-yaml.js
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Convert YAML data structure to .poem format
 */
class YamlToPoemConverter {
  constructor(data) {
    this.data = data;
    this.lines = [];
  }

  /**
   * Main conversion method
   */
  convert() {
    this.writeHeader();
    this.writeVersions();
    this.writeAudio();
    this.writePostscript();
    this.writeAnalysis();

    return this.lines.join('\n');
  }

  /**
   * Add a line to output
   */
  addLine(line = '') {
    this.lines.push(line);
  }

  /**
   * Add multiple blank lines
   */
  addBlankLines(count = 1) {
    for (let i = 0; i < count; i++) {
      this.addLine();
    }
  }

  /**
   * Write header section
   */
  writeHeader() {
    this.addLine(this.data.title);

    // Only add author line if it's not the default
    if (this.data.author && this.data.author !== 'A Poet') {
      this.addLine(this.data.author);
    }

    // Format date as YYYY-MM-DD
    const date = this.formatDate(this.data.date);
    this.addLine(date);
    this.addBlankLines();
  }

  /**
   * Format date to YYYY-MM-DD
   */
  formatDate(dateInput) {
    // If it's already in YYYY-MM-DD format, return as is
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return dateInput;
    }

    // Parse date and format as YYYY-MM-DD
    const date = new Date(dateInput);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Write versions section
   */
  writeVersions() {
    if (!this.data.versions || this.data.versions.length === 0) {
      throw new Error('No versions found in YAML data');
    }

    for (let i = 0; i < this.data.versions.length; i++) {
      const version = this.data.versions[i];

      // Add version label if present
      if (version.label) {
        this.addLine(`{{ ${version.label} }}`);
        this.addBlankLines();
      }

      // Write segments
      if (!version.segments || version.segments.length === 0) {
        throw new Error(`Version ${i + 1} has no segments`);
      }

      for (let j = 0; j < version.segments.length; j++) {
        const segment = version.segments[j];

        // Add segment label if present
        if (segment.label) {
          this.addLine(`{${segment.label}}`);
        }

        // Write segment lines
        if (segment.lines) {
          // Remove trailing newline from lines if present
          const lines = segment.lines.endsWith('\n')
            ? segment.lines.slice(0, -1)
            : segment.lines;
          this.addLine(lines);
        }

        // Add blank line between segments (except after last segment)
        if (j < version.segments.length - 1) {
          this.addBlankLines();
        }
      }

      // Add version divider if not the last version
      if (i < this.data.versions.length - 1) {
        this.addBlankLines(2);
        this.addLine('----');
        this.addBlankLines(2);
      }
    }

    // End of versions marker
    this.addBlankLines();
    this.addLine('====');
    this.addBlankLines();
  }

  /**
   * Write audio section
   */
  writeAudio() {
    if (this.data.audio) {
      // Service names are data-driven (see song-handlers.js /
      // song-handlers.yaml) -- write back whatever the YAML has, in order,
      // rather than a fixed Audiomack/Suno pair. A value of `true` becomes
      // a bare line; a non-empty string value becomes "Service: value".
      for (const [service, value] of Object.entries(this.data.audio)) {
        const displayName = service.charAt(0).toUpperCase() + service.slice(1);
        if (value === true) {
          this.addLine(displayName);
        } else if (typeof value === 'string' && value.trim() !== '') {
          this.addLine(`${displayName}: ${value}`);
        }
      }
      this.addBlankLines();
    }

    // End of audio marker
    this.addLine('====');
    this.addBlankLines();
  }

  /**
   * Write postscript section
   */
  writePostscript() {
    if (this.data.postscript && this.data.postscript.length > 0) {
      for (let i = 0; i < this.data.postscript.length; i++) {
        const note = this.data.postscript[i];

        // Handle $ref (literal block)
        if (note.$ref) {
          this.addLine('<<<');
          this.addLine(`  - $ref: "${note.$ref}"`);
          this.addLine('>>>');
        } else {
          // Add label if present
          if (note.label) {
            this.addLine(`{${note.label}}`);
          }

          // Convert HTML content back to plain text
          if (note.content) {
            const plainText = this.convertHtmlToPlainText(note.content);
            this.addLine(plainText);
          }
        }

        // Add divider between postscript notes (except after last one)
        if (i < this.data.postscript.length - 1) {
          this.addBlankLines(2);
          this.addLine('----');
          this.addBlankLines();
        }
      }

      this.addBlankLines();
    }

    // End of postscript marker
    this.addLine('====');
    this.addBlankLines();
  }

  /**
   * Write analysis section
   */
  writeAnalysis() {
    if (this.data.analysis) {
      // Write synopsis if present
      if (this.data.analysis.synopsis) {
        this.addLine('{Synopsis}');
        this.addBlankLines();
        const synopsis = this.convertHtmlToPlainText(this.data.analysis.synopsis);
        this.addLine(synopsis);
        this.addBlankLines(2);
      }

      // Write full analysis if present
      if (this.data.analysis.full) {
        this.addLine('{Full}');
        this.addBlankLines();
        const full = this.convertHtmlToPlainText(this.data.analysis.full);
        this.addLine(full);
        this.addBlankLines();
      }

      // End of file marker (optional, but include it)
      this.addLine('====');
    }
  }

  /**
   * Convert HTML content back to plain text with markup
   */
  convertHtmlToPlainText(html) {
    // First normalize multi-line HTML tags to single lines
    html = html.replace(/<(h[2-5])[^>]*>\s*(.*?)\s*<\/\1>/gs, (match, tag, content) => {
      // Collapse whitespace in heading content
      const cleanContent = content.replace(/\s+/g, ' ').trim();
      return `<${tag}>${cleanContent}</${tag}>`;
    });

    // Split by double newlines to get blocks
    const blocks = html.trim().split(/\n\n+/);
    const result = [];

    for (const block of blocks) {
      const trimmed = block.trim();

      // Handle headings (now they're single-line after normalization)
      if (trimmed.match(/^<h5[^>]*>/) && trimmed.endsWith('</h5>')) {
        const text = this.stripHtmlTags(trimmed.replace(/^<h5[^>]*>/, '').replace(/<\/h5>$/, ''));
        result.push(`### ${text}`);
      } else if (trimmed.match(/^<h4[^>]*>/) && trimmed.endsWith('</h4>')) {
        const text = this.stripHtmlTags(trimmed.replace(/^<h4[^>]*>/, '').replace(/<\/h4>$/, ''));
        result.push(`## ${text}`);
      } else if (trimmed.match(/^<h3[^>]*>/) && trimmed.endsWith('</h3>')) {
        const text = this.stripHtmlTags(trimmed.replace(/^<h3[^>]*>/, '').replace(/<\/h3>$/, ''));
        result.push(`# ${text}`);
      } else if (trimmed.match(/^<h2[^>]*>/) && trimmed.endsWith('</h2>')) {
        const text = this.stripHtmlTags(trimmed.replace(/^<h2[^>]*>/, '').replace(/<\/h2>$/, ''));
        result.push(`# ${text}`);
      } else if (trimmed.startsWith('<p>') && trimmed.endsWith('</p>')) {
        // Paragraph - convert HTML entities back to markup
        const text = this.stripHtmlTags(trimmed.slice(3, -4));
        result.push(this.convertEntitiesToMarkup(text));
      } else if (trimmed === '') {
        // Skip empty blocks
        continue;
      } else {
        // Plain text
        result.push(this.convertEntitiesToMarkup(trimmed));
      }
    }

    return result.join('\n\n');
  }

  /**
   * Strip HTML tags and convert inline markup
   */
  stripHtmlTags(text) {
    // Convert inline HTML tags back to markup
    text = text.replace(/<em>(.*?)<\/em>/g, '_$1_');
    text = text.replace(/<strong>(.*?)<\/strong>/g, '*$1*');
    text = text.replace(/<s>(.*?)<\/s>/g, '~$1~');
    text = text.replace(/<a href="https?:\/\/(.*?)">(.*?)<\/a>/g, '[$2|$1]');

    return this.convertEntitiesToMarkup(text);
  }

  /**
   * Convert HTML entities back to markup
   */
  convertEntitiesToMarkup(text) {
    // First decode common named entities
    text = text.replace(/&ldquo;/g, '&#8220;');
    text = text.replace(/&rdquo;/g, '&#8221;');
    text = text.replace(/&lsquo;/g, '&#8216;');
    text = text.replace(/&rsquo;/g, '&#8217;');
    text = text.replace(/&mdash;/g, '&#8212;');
    text = text.replace(/&ndash;/g, '&#8211;');
    text = text.replace(/&apos;/g, '&#39;');
    text = text.replace(/&nbsp;/g, ' ');

    // Convert smart quotes to markup (paired quotes)
    text = text.replace(/&#8220;(.*?)&#8221;/g, '"$1"');
    text = text.replace(/&#8216;(.*?)&#8217;/g, '`$1`');

    // Convert dashes to markup
    text = text.replace(/&#8212;/g, '---');
    text = text.replace(/&#8211;/g, '--');

    // Handle unpaired smart quotes (convert to regular quotes)
    text = text.replace(/&#8220;/g, '"');
    text = text.replace(/&#8221;/g, '"');
    text = text.replace(/&#8216;/g, '`');
    text = text.replace(/&#8217;/g, '`');

    // Convert remaining entities to characters (not markup)
    // These will just be plain characters in the .poem file
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&#34;/g, '"');
    text = text.replace(/&#60;/g, '<');
    text = text.replace(/&#62;/g, '>');

    // Decode &#38; (ampersand) last. Every entity pattern above starts with
    // a literal "&", so decoding it any earlier would let the "&" it
    // produces combine with leftover text into a new entity-shaped sequence
    // -- e.g. "&#38;#8220;" (literally the text "&#8220;") reconstitutes
    // into "&#8220;" mid-pipeline -- which an earlier replace above would
    // then never see, but a later one still pending would decode a second
    // time, corrupting literal text into markup (CodeQL js/double-escaping).
    // This ordered-pass approach is correct but order-fragile; see TD26071501
    // in TECH-DEBT.md for a structurally single-pass alternative.
    text = text.replace(/&#38;/g, '&');

    return text;
  }
}

/**
 * Convert a YAML file to .poem format
 */
function convertYamlToPoem(yamlFilePath) {
  const content = fs.readFileSync(yamlFilePath, 'utf8');
  const data = yaml.load(content);

  const converter = new YamlToPoemConverter(data);
  return converter.convert();
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: yaml-to-poem.js <file.yaml> [output.poem]');
    console.error('   or: yaml-to-poem.js --all');
    process.exit(1);
  }

  if (args[0] === '--all') {
    // Convert all .yaml files in poems/ directory (except special files)
    const poemsDir = path.join(process.cwd(), 'src', 'poems');
    const files = fs.readdirSync(poemsDir);

    const skipFiles = ['_shared.yaml', '_example.yaml'];
    let converted = 0;

    for (const file of files) {
      if (file.endsWith('.yaml') && !skipFiles.includes(file)) {
        const yamlPath = path.join(poemsDir, file);
        const poemPath = path.join(poemsDir, file.replace('.yaml', '.poem'));

        try {
          console.log(`Converting ${file}...`);
          const poemContent = convertYamlToPoem(yamlPath);
          fs.writeFileSync(poemPath, poemContent, 'utf8');
          console.log(`  → ${path.basename(poemPath)}`);
          converted++;
        } catch (error) {
          console.error(`Error converting ${file}:`, error.message);
        }
      }
    }

    console.log(`\nConverted ${converted} YAML files to .poem format`);
  } else {
    // Convert single file
    const inputFile = args[0];
    const outputFile = args[1] || inputFile.replace('.yaml', '.poem');

    try {
      const poemContent = convertYamlToPoem(inputFile);
      fs.writeFileSync(outputFile, poemContent, 'utf8');
      console.log(`Converted ${inputFile} → ${outputFile}`);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { YamlToPoemConverter, convertYamlToPoem };

