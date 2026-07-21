// AUTO-GENERATED — do not edit by hand.
// Source: src/templates/poem.pug, src/templates/poem-page.pug (+ _poem-content.pug)
// Regenerate: npm run build:generated  (src/tools/build-templates.js)
//
// Pug templates precompiled to standalone JS functions (no `pug`, no `fs`),
// so the browser renderer (src/browser/render.js) can render without the Pug
// compiler or the filesystem. Each takes the same locals object the
// runtime-compiled template does, and is kept byte-identical to the runtime
// compile by test/poem-templates.test.js.

'use strict';

const renderFragmentTemplate = (function () {
function pug_attr(t,e,n,r){if(!1===e||null==e||!e&&("class"===t||"style"===t))return"";if(!0===e)return" "+(r?t:t+'="'+t+'"');var f=typeof e;return"object"!==f&&"function"!==f||"function"!=typeof e.toJSON||(e=e.toJSON()),"string"==typeof e||(e=JSON.stringify(e),n||-1===e.indexOf('"'))?(n&&(e=pug_escape(e))," "+t+'="'+e+'"'):" "+t+"='"+e.replace(/'/g,"&#39;")+"'"}
function pug_classes(s,r){return Array.isArray(s)?pug_classes_array(s,r):s&&"object"==typeof s?pug_classes_object(s):s||""}
function pug_classes_array(r,a){for(var s,e="",u="",c=Array.isArray(a),g=0;g<r.length;g++)(s=pug_classes(r[g]))&&(c&&a[g]&&(s=pug_escape(s)),e=e+u+s,u=" ");return e}
function pug_classes_object(r){var a="",n="";for(var o in r)o&&r[o]&&pug_has_own_property.call(r,o)&&(a=a+n+o,n=" ");return a}
function pug_escape(e){var a=""+e,t=pug_match_html.exec(a);if(!t)return e;var r,c,n,s="";for(r=t.index,c=0;r<a.length;r++){switch(a.charCodeAt(r)){case 34:n="&quot;";break;case 38:n="&amp;";break;case 60:n="&lt;";break;case 62:n="&gt;";break;default:continue}c!==r&&(s+=a.substring(c,r)),c=r+1,s+=n}return c!==r?s+a.substring(c,r):s}
var pug_has_own_property=Object.prototype.hasOwnProperty;
var pug_match_html=/["&<>]/;
function pug_style(r){if(!r)return"";if("object"==typeof r){var t="";for(var e in r)pug_has_own_property.call(r,e)&&(t=t+e+":"+r[e]+";");return t}return r+""}function template(locals) {var pug_html = "", pug_mixins = {}, pug_interp;;
    var locals_for_with = (locals || {});

    (function (analysis, author, date, encodeURIComponent, isNaN, labelBase, labels, parseInt, postscript, slug, songs, standalone, titleHtml, versions) {
      function slugify(text) {
text = text.toLowerCase().trim()
text = text.replace(/[^a-z0-9 -]/g, '')
text = text.replace(/ +/g, '-')
return text;
}
function postscriptPreviewSettings(params) {
const preview = !(params && params.preview === 'false');
let previewLines = parseInt(params && params['preview-lines'], 10);
if (isNaN(previewLines) || previewLines < 1) previewLines = 5;
return { preview, previewLines };
}
function processAnalysisText(text) {
const paragraphs = text.split(/\n\s*\n/).map(para => para.trim()).filter(para => para.length > 0);
const processedParagraphs = paragraphs.map(para => {
if (para.includes('<') && para.includes('>')) {
return para;
} else {
return '<p>' + para + '</p>';
}
});
return processedParagraphs.join('');
}
pug_mixins["processLines"] = pug_interp = function(text){
var block = (this && this.block), attributes = (this && this.attributes) || {};
if (text) {
const lines = text.split('\n')
let index = 0
// iterate lines
;(function(){
  var $$obj = lines;
  if ('number' == typeof $$obj.length) {
      for (var pug_index0 = 0, $$l = $$obj.length; pug_index0 < $$l; pug_index0++) {
        var line = $$obj[pug_index0];
pug_html = pug_html + (null == (pug_interp = line) ? "" : pug_interp);
if (index < lines.length - 1) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
index++
      }
  } else {
    var $$l = 0;
    for (var pug_index0 in $$obj) {
      $$l++;
      var line = $$obj[pug_index0];
pug_html = pug_html + (null == (pug_interp = line) ? "" : pug_interp);
if (index < lines.length - 1) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
index++
    }
  }
}).call(this);

}
};
pug_mixins["poemContent"] = pug_interp = function(){
var block = (this && this.block), attributes = (this && this.attributes) || {};
if (standalone) {
pug_html = pug_html + "\u003Ch2 class=\"poem-title\"\u003E" + (null == (pug_interp = titleHtml) ? "" : pug_interp) + "\u003C\u002Fh2\u003E";
}
pug_html = pug_html + "\u003Cdiv" + (pug_attr("id", `poem--${slug}`, true, false)) + "\u003E\u003Cdiv class=\"poem-info\"\u003E\u003Cspan" + (" class=\"title\""+pug_attr("id", `title--${slug}`, true, false)) + "\u003E" + (null == (pug_interp = titleHtml) ? "" : pug_interp) + "\u003C\u002Fspan\u003E\u003Cbr\u002F\u003E\u003Cspan" + (" class=\"author\""+pug_attr("id", `author--${slug}`, true, false)) + "\u003E" + (pug_escape(null == (pug_interp = author) ? "" : pug_interp)) + "\u003C\u002Fspan\u003E\u003Cbr\u002F\u003E\u003Cspan" + (" class=\"date\""+pug_attr("id", `date--${slug}`, true, false)) + "\u003E" + (pug_escape(null == (pug_interp = date) ? "" : pug_interp)) + "\u003C\u002Fspan\u003E\u003Cbr\u002F\u003E\u003C\u002Fdiv\u003E\u003Cbr\u002F\u003E\u003Cdiv class=\"poem-body\"\u003E";
if (versions && versions.length > 0) {
// iterate versions
;(function(){
  var $$obj = versions;
  if ('number' == typeof $$obj.length) {
      for (var versionIndex = 0, $$l = $$obj.length; versionIndex < $$l; versionIndex++) {
        var version = $$obj[versionIndex];
if (version.label) {
pug_html = pug_html + "\u003Chr\u002F\u003E\u003Cdiv class=\"poem-info\"\u003E" + (null == (pug_interp = version.label) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E";
}
if (version.segments && version.segments.length > 0) {
// iterate version.segments
;(function(){
  var $$obj = version.segments;
  if ('number' == typeof $$obj.length) {
      for (var pug_index2 = 0, $$l = $$obj.length; pug_index2 < $$l; pug_index2++) {
        var segment = $$obj[pug_index2];
if (segment.label) {
pug_html = pug_html + "\u003Cspan class=\"song-segment\"\u003E" + (null == (pug_interp = `[${segment.label}]`) ? "" : pug_interp) + "\u003C\u002Fspan\u003E\u003Cbr\u002F\u003E";
}
if (segment.parts) {
// iterate segment.parts
;(function(){
  var $$obj = segment.parts;
  if ('number' == typeof $$obj.length) {
      for (var pug_index3 = 0, $$l = $$obj.length; pug_index3 < $$l; pug_index3++) {
        var part = $$obj[pug_index3];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
      }
  } else {
    var $$l = 0;
    for (var pug_index3 in $$obj) {
      $$l++;
      var part = $$obj[pug_index3];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
    }
  }
}).call(this);

}
else {
pug_mixins["processLines"](segment.lines);
}
if (segment !== version.segments[version.segments.length - 1]) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
      }
  } else {
    var $$l = 0;
    for (var pug_index2 in $$obj) {
      $$l++;
      var segment = $$obj[pug_index2];
if (segment.label) {
pug_html = pug_html + "\u003Cspan class=\"song-segment\"\u003E" + (null == (pug_interp = `[${segment.label}]`) ? "" : pug_interp) + "\u003C\u002Fspan\u003E\u003Cbr\u002F\u003E";
}
if (segment.parts) {
// iterate segment.parts
;(function(){
  var $$obj = segment.parts;
  if ('number' == typeof $$obj.length) {
      for (var pug_index4 = 0, $$l = $$obj.length; pug_index4 < $$l; pug_index4++) {
        var part = $$obj[pug_index4];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
      }
  } else {
    var $$l = 0;
    for (var pug_index4 in $$obj) {
      $$l++;
      var part = $$obj[pug_index4];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
    }
  }
}).call(this);

}
else {
pug_mixins["processLines"](segment.lines);
}
if (segment !== version.segments[version.segments.length - 1]) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
    }
  }
}).call(this);

}
if (versionIndex < versions.length - 1) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
      }
  } else {
    var $$l = 0;
    for (var versionIndex in $$obj) {
      $$l++;
      var version = $$obj[versionIndex];
if (version.label) {
pug_html = pug_html + "\u003Chr\u002F\u003E\u003Cdiv class=\"poem-info\"\u003E" + (null == (pug_interp = version.label) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E";
}
if (version.segments && version.segments.length > 0) {
// iterate version.segments
;(function(){
  var $$obj = version.segments;
  if ('number' == typeof $$obj.length) {
      for (var pug_index5 = 0, $$l = $$obj.length; pug_index5 < $$l; pug_index5++) {
        var segment = $$obj[pug_index5];
if (segment.label) {
pug_html = pug_html + "\u003Cspan class=\"song-segment\"\u003E" + (null == (pug_interp = `[${segment.label}]`) ? "" : pug_interp) + "\u003C\u002Fspan\u003E\u003Cbr\u002F\u003E";
}
if (segment.parts) {
// iterate segment.parts
;(function(){
  var $$obj = segment.parts;
  if ('number' == typeof $$obj.length) {
      for (var pug_index6 = 0, $$l = $$obj.length; pug_index6 < $$l; pug_index6++) {
        var part = $$obj[pug_index6];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
      }
  } else {
    var $$l = 0;
    for (var pug_index6 in $$obj) {
      $$l++;
      var part = $$obj[pug_index6];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
    }
  }
}).call(this);

}
else {
pug_mixins["processLines"](segment.lines);
}
if (segment !== version.segments[version.segments.length - 1]) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
      }
  } else {
    var $$l = 0;
    for (var pug_index5 in $$obj) {
      $$l++;
      var segment = $$obj[pug_index5];
if (segment.label) {
pug_html = pug_html + "\u003Cspan class=\"song-segment\"\u003E" + (null == (pug_interp = `[${segment.label}]`) ? "" : pug_interp) + "\u003C\u002Fspan\u003E\u003Cbr\u002F\u003E";
}
if (segment.parts) {
// iterate segment.parts
;(function(){
  var $$obj = segment.parts;
  if ('number' == typeof $$obj.length) {
      for (var pug_index7 = 0, $$l = $$obj.length; pug_index7 < $$l; pug_index7++) {
        var part = $$obj[pug_index7];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
      }
  } else {
    var $$l = 0;
    for (var pug_index7 in $$obj) {
      $$l++;
      var part = $$obj[pug_index7];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
    }
  }
}).call(this);

}
else {
pug_mixins["processLines"](segment.lines);
}
if (segment !== version.segments[version.segments.length - 1]) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
    }
  }
}).call(this);

}
if (versionIndex < versions.length - 1) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
    }
  }
}).call(this);

}
else {
pug_html = pug_html + "\u003Cp class=\"no-content\"\u003ENo content available\u003C\u002Fp\u003E";
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
if (labels && labels.length > 0) {
pug_html = pug_html + "\u003Cul class=\"poem-labels\"\u003E";
// iterate labels
;(function(){
  var $$obj = labels;
  if ('number' == typeof $$obj.length) {
      for (var pug_index8 = 0, $$l = $$obj.length; pug_index8 < $$l; pug_index8++) {
        var label = $$obj[pug_index8];
pug_html = pug_html + "\u003Cli\u003E\u003Ca" + (" class=\"poem-label\""+pug_attr("href", `${labelBase || ''}all-poems.html?scope=labels&q=${encodeURIComponent(label)}`, true, false)) + "\u003E" + (pug_escape(null == (pug_interp = label) ? "" : pug_interp)) + "\u003C\u002Fa\u003E\u003C\u002Fli\u003E";
      }
  } else {
    var $$l = 0;
    for (var pug_index8 in $$obj) {
      $$l++;
      var label = $$obj[pug_index8];
pug_html = pug_html + "\u003Cli\u003E\u003Ca" + (" class=\"poem-label\""+pug_attr("href", `${labelBase || ''}all-poems.html?scope=labels&q=${encodeURIComponent(label)}`, true, false)) + "\u003E" + (pug_escape(null == (pug_interp = label) ? "" : pug_interp)) + "\u003C\u002Fa\u003E\u003C\u002Fli\u003E";
    }
  }
}).call(this);

pug_html = pug_html + "\u003C\u002Ful\u003E";
}
if (songs && songs.length > 0) {
pug_html = pug_html + "\u003Cdiv" + (" class=\"song-link\""+pug_attr("id", `song--${slug}`, true, false)) + "\u003E";
// iterate songs
;(function(){
  var $$obj = songs;
  if ('number' == typeof $$obj.length) {
      for (var pug_index9 = 0, $$l = $$obj.length; pug_index9 < $$l; pug_index9++) {
        var song = $$obj[pug_index9];
let songItemClass = `song-item song-item--${song.service}`
if (song.embed) songItemClass += ' song-item-embed'
if (song.link) songItemClass += ' song-item-link'
pug_html = pug_html + "\u003Cdiv" + (pug_attr("class", pug_classes([songItemClass], [true]), false, false)) + "\u003E";
if (song.embed) {
let embedClass = `song-embed song-embed--${song.service}`
if (song.embed.media) embedClass += ` song-embed--${song.service}--${song.embed.media}`
pug_html = pug_html + "\u003Cdiv" + (pug_attr("class", pug_classes([embedClass], [true]), false, false)+pug_attr("data-embed-media", song.embed.media, true, false)) + "\u003E\u003Cbutton" + (" class=\"song-embed-btn\""+pug_attr("id", `song-embed-btn--${song.service}--${slug}`, true, false)+" type=\"button\""+pug_attr("data-embed-src", song.embed.src, true, false)+pug_attr("data-title", song.embed.title, true, false)+pug_attr("data-allow", song.embed.allow, true, false)+pug_attr("data-allow-fullscreen", song.embed.allowFullscreen, true, false)) + "\u003E" + (pug_escape(null == (pug_interp = song.embed.buttonLabel) ? "" : pug_interp)) + "\u003C\u002Fbutton\u003E";
let playerClass = 'song-embed-player hidden'
if (song.embed.sizeIsAspect) playerClass += ' song-embed-player--aspect'
let playerStyle = song.embed.sizeVar ? `${song.embed.sizeVar}: ${song.embed.sizeValue}` : false
pug_html = pug_html + "\u003Cdiv" + (pug_attr("class", pug_classes([playerClass], [true]), false, false)+pug_attr("style", pug_style(playerStyle), true, false)) + "\u003E\u003C\u002Fdiv\u003E\u003C\u002Fdiv\u003E";
}
if (song.link) {
pug_html = pug_html + "\u003Ca" + (pug_attr("class", pug_classes(["song-link-anchor",`song-link--${song.service}`], [false,true]), false, false)+pug_attr("href", song.link.href, true, false)+" target=\"_blank\"") + "\u003E" + (pug_escape(null == (pug_interp = song.link.label) ? "" : pug_interp)) + "\u003C\u002Fa\u003E";
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
      }
  } else {
    var $$l = 0;
    for (var pug_index9 in $$obj) {
      $$l++;
      var song = $$obj[pug_index9];
let songItemClass = `song-item song-item--${song.service}`
if (song.embed) songItemClass += ' song-item-embed'
if (song.link) songItemClass += ' song-item-link'
pug_html = pug_html + "\u003Cdiv" + (pug_attr("class", pug_classes([songItemClass], [true]), false, false)) + "\u003E";
if (song.embed) {
let embedClass = `song-embed song-embed--${song.service}`
if (song.embed.media) embedClass += ` song-embed--${song.service}--${song.embed.media}`
pug_html = pug_html + "\u003Cdiv" + (pug_attr("class", pug_classes([embedClass], [true]), false, false)+pug_attr("data-embed-media", song.embed.media, true, false)) + "\u003E\u003Cbutton" + (" class=\"song-embed-btn\""+pug_attr("id", `song-embed-btn--${song.service}--${slug}`, true, false)+" type=\"button\""+pug_attr("data-embed-src", song.embed.src, true, false)+pug_attr("data-title", song.embed.title, true, false)+pug_attr("data-allow", song.embed.allow, true, false)+pug_attr("data-allow-fullscreen", song.embed.allowFullscreen, true, false)) + "\u003E" + (pug_escape(null == (pug_interp = song.embed.buttonLabel) ? "" : pug_interp)) + "\u003C\u002Fbutton\u003E";
let playerClass = 'song-embed-player hidden'
if (song.embed.sizeIsAspect) playerClass += ' song-embed-player--aspect'
let playerStyle = song.embed.sizeVar ? `${song.embed.sizeVar}: ${song.embed.sizeValue}` : false
pug_html = pug_html + "\u003Cdiv" + (pug_attr("class", pug_classes([playerClass], [true]), false, false)+pug_attr("style", pug_style(playerStyle), true, false)) + "\u003E\u003C\u002Fdiv\u003E\u003C\u002Fdiv\u003E";
}
if (song.link) {
pug_html = pug_html + "\u003Ca" + (pug_attr("class", pug_classes(["song-link-anchor",`song-link--${song.service}`], [false,true]), false, false)+pug_attr("href", song.link.href, true, false)+" target=\"_blank\"") + "\u003E" + (pug_escape(null == (pug_interp = song.link.label) ? "" : pug_interp)) + "\u003C\u002Fa\u003E";
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
    }
  }
}).call(this);

pug_html = pug_html + "\u003C\u002Fdiv\u003E";
}
if (postscript && postscript.length > 0) {
// iterate postscript
;(function(){
  var $$obj = postscript;
  if ('number' == typeof $$obj.length) {
      for (var pug_index10 = 0, $$l = $$obj.length; pug_index10 < $$l; pug_index10++) {
        var postscriptItem = $$obj[pug_index10];
const postscriptId = `postscript-${postscriptItem.label ? slugify(postscriptItem.label) : 'item'}--${slug}`
const { preview, previewLines } = postscriptPreviewSettings(postscriptItem.params)
pug_html = pug_html + "\u003Cdiv" + (" class=\"postscript\""+pug_attr("id", postscriptId, true, false)) + "\u003E";
if (postscriptItem.label) {
pug_html = pug_html + "\u003Cdiv class=\"postscript-label\"\u003E" + (null == (pug_interp = postscriptItem.label) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E";
}
if (postscriptItem.content) {
const processedContent = postscriptItem.content
if (preview) {
const toggleId = `${postscriptId}--more`
const contentId = `${postscriptId}--content`
pug_html = pug_html + "\u003Cdiv" + (" class=\"postscript-content\""+pug_attr("id", contentId, true, false)+pug_attr("style", pug_style(`--preview-lines: ${previewLines}`), true, false)+pug_attr("data-preview-lines", previewLines, true, false)) + "\u003E" + (null == (pug_interp = processedContent) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E\u003Cbutton" + (" class=\"postscript-toggle\""+pug_attr("id", toggleId, true, false)+" type=\"button\" aria-expanded=\"false\""+pug_attr("aria-controls", contentId, true, false)) + "\u003E\u003Cspan class=\"sr-only\"\u003ESee more\u003C\u002Fspan\u003E\u003C\u002Fbutton\u003E";
}
else {
pug_html = pug_html + (null == (pug_interp = processedContent) ? "" : pug_interp);
}
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
      }
  } else {
    var $$l = 0;
    for (var pug_index10 in $$obj) {
      $$l++;
      var postscriptItem = $$obj[pug_index10];
const postscriptId = `postscript-${postscriptItem.label ? slugify(postscriptItem.label) : 'item'}--${slug}`
const { preview, previewLines } = postscriptPreviewSettings(postscriptItem.params)
pug_html = pug_html + "\u003Cdiv" + (" class=\"postscript\""+pug_attr("id", postscriptId, true, false)) + "\u003E";
if (postscriptItem.label) {
pug_html = pug_html + "\u003Cdiv class=\"postscript-label\"\u003E" + (null == (pug_interp = postscriptItem.label) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E";
}
if (postscriptItem.content) {
const processedContent = postscriptItem.content
if (preview) {
const toggleId = `${postscriptId}--more`
const contentId = `${postscriptId}--content`
pug_html = pug_html + "\u003Cdiv" + (" class=\"postscript-content\""+pug_attr("id", contentId, true, false)+pug_attr("style", pug_style(`--preview-lines: ${previewLines}`), true, false)+pug_attr("data-preview-lines", previewLines, true, false)) + "\u003E" + (null == (pug_interp = processedContent) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E\u003Cbutton" + (" class=\"postscript-toggle\""+pug_attr("id", toggleId, true, false)+" type=\"button\" aria-expanded=\"false\""+pug_attr("aria-controls", contentId, true, false)) + "\u003E\u003Cspan class=\"sr-only\"\u003ESee more\u003C\u002Fspan\u003E\u003C\u002Fbutton\u003E";
}
else {
pug_html = pug_html + (null == (pug_interp = processedContent) ? "" : pug_interp);
}
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
    }
  }
}).call(this);

}
if (analysis) {
pug_html = pug_html + "\u003Cbutton" + (" class=\"analysis show\""+pug_attr("id", `show-analysis--${slug}`, true, false)+" type=\"button\""+pug_attr("onclick", `document.getElementById('analysis--${slug}').style.display = 'block'; document.getElementById('show-analysis--${slug}').style.display = 'none';`, true, false)) + "\u003EShow analysis\u003C\u002Fbutton\u003E\u003Cdiv" + (" class=\"analysis\""+pug_attr("id", `analysis--${slug}`, true, false)) + "\u003E\u003Cbutton" + (" class=\"analysis hide\""+pug_attr("id", `hide-analysis--${slug}`, true, false)+" type=\"button\""+pug_attr("onclick", `document.getElementById('analysis--${slug}').style.display = 'none'; document.getElementById('show-analysis--${slug}').style.display = 'block';`, true, false)) + "\u003EHide analysis\u003C\u002Fbutton\u003E";
if (analysis.synopsis && analysis.full) {
pug_html = pug_html + "\u003Cdiv class=\"full-or-synopsis-selector\"\u003E\u003Cbutton" + (" class=\"analysis selector selected\""+pug_attr("id", `analysis-select-syno--${slug}`, true, false)+" type=\"button\""+pug_attr("onclick", `el = name => document.getElementById('analysis-' + name + '--${slug}'); el('full').style.display = 'none'; el('syno').style.display = 'block'; el('select-full').classList.remove('selected'); el('select-syno').classList.add('selected');`, true, false)) + "\u003ESynopsis\u003C\u002Fbutton\u003E\u003Cbutton" + (" class=\"analysis selector\""+pug_attr("id", `analysis-select-full--${slug}`, true, false)+" type=\"button\""+pug_attr("onclick", `el = name => document.getElementById('analysis-' + name + '--${slug}'); el('full').style.display = 'block'; el('syno').style.display = 'none'; el('select-full').classList.add('selected'); el('select-syno').classList.remove('selected');`, true, false)) + "\u003EFull Analysis\u003C\u002Fbutton\u003E\u003C\u002Fdiv\u003E\u003Cdiv" + (pug_attr("id", `analysis-syno--${slug}`, true, false)) + "\u003E\u003Ch2\u003EAnalysis of \u003Cem\u003E" + (null == (pug_interp = titleHtml) ? "" : pug_interp) + "\u003C\u002Fem\u003E (synopsis)\u003C\u002Fh2\u003E";
const processedSynopsis = processAnalysisText(analysis.synopsis)
pug_html = pug_html + (null == (pug_interp = processedSynopsis) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E\u003Cdiv" + (" class=\"hidden\""+pug_attr("id", `analysis-full--${slug}`, true, false)) + "\u003E\u003Ch2\u003EAnalysis of \u003Cem\u003E" + (null == (pug_interp = titleHtml) ? "" : pug_interp) + "\u003C\u002Fem\u003E\u003C\u002Fh2\u003E";
const processedFull = processAnalysisText(analysis.full)
pug_html = pug_html + (null == (pug_interp = processedFull) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E";
}
else {
pug_html = pug_html + "\u003Ch2\u003EAnalysis of \u003Cem\u003E" + (null == (pug_interp = titleHtml) ? "" : pug_interp) + "\u003C\u002Fem\u003E\u003C\u002Fh2\u003E";
const processedFull = processAnalysisText(analysis.full)
pug_html = pug_html + (null == (pug_interp = processedFull) ? "" : pug_interp);
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
};
pug_mixins["poemContent"]();
    }.call(this, "analysis" in locals_for_with ?
        locals_for_with.analysis :
        typeof analysis !== 'undefined' ? analysis : undefined, "author" in locals_for_with ?
        locals_for_with.author :
        typeof author !== 'undefined' ? author : undefined, "date" in locals_for_with ?
        locals_for_with.date :
        typeof date !== 'undefined' ? date : undefined, "encodeURIComponent" in locals_for_with ?
        locals_for_with.encodeURIComponent :
        typeof encodeURIComponent !== 'undefined' ? encodeURIComponent : undefined, "isNaN" in locals_for_with ?
        locals_for_with.isNaN :
        typeof isNaN !== 'undefined' ? isNaN : undefined, "labelBase" in locals_for_with ?
        locals_for_with.labelBase :
        typeof labelBase !== 'undefined' ? labelBase : undefined, "labels" in locals_for_with ?
        locals_for_with.labels :
        typeof labels !== 'undefined' ? labels : undefined, "parseInt" in locals_for_with ?
        locals_for_with.parseInt :
        typeof parseInt !== 'undefined' ? parseInt : undefined, "postscript" in locals_for_with ?
        locals_for_with.postscript :
        typeof postscript !== 'undefined' ? postscript : undefined, "slug" in locals_for_with ?
        locals_for_with.slug :
        typeof slug !== 'undefined' ? slug : undefined, "songs" in locals_for_with ?
        locals_for_with.songs :
        typeof songs !== 'undefined' ? songs : undefined, "standalone" in locals_for_with ?
        locals_for_with.standalone :
        typeof standalone !== 'undefined' ? standalone : undefined, "titleHtml" in locals_for_with ?
        locals_for_with.titleHtml :
        typeof titleHtml !== 'undefined' ? titleHtml : undefined, "versions" in locals_for_with ?
        locals_for_with.versions :
        typeof versions !== 'undefined' ? versions : undefined));
    ;;return pug_html;}
return template;
})();

const renderPageTemplate = (function () {
function pug_attr(t,e,n,r){if(!1===e||null==e||!e&&("class"===t||"style"===t))return"";if(!0===e)return" "+(r?t:t+'="'+t+'"');var f=typeof e;return"object"!==f&&"function"!==f||"function"!=typeof e.toJSON||(e=e.toJSON()),"string"==typeof e||(e=JSON.stringify(e),n||-1===e.indexOf('"'))?(n&&(e=pug_escape(e))," "+t+'="'+e+'"'):" "+t+"='"+e.replace(/'/g,"&#39;")+"'"}
function pug_classes(s,r){return Array.isArray(s)?pug_classes_array(s,r):s&&"object"==typeof s?pug_classes_object(s):s||""}
function pug_classes_array(r,a){for(var s,e="",u="",c=Array.isArray(a),g=0;g<r.length;g++)(s=pug_classes(r[g]))&&(c&&a[g]&&(s=pug_escape(s)),e=e+u+s,u=" ");return e}
function pug_classes_object(r){var a="",n="";for(var o in r)o&&r[o]&&pug_has_own_property.call(r,o)&&(a=a+n+o,n=" ");return a}
function pug_escape(e){var a=""+e,t=pug_match_html.exec(a);if(!t)return e;var r,c,n,s="";for(r=t.index,c=0;r<a.length;r++){switch(a.charCodeAt(r)){case 34:n="&quot;";break;case 38:n="&amp;";break;case 60:n="&lt;";break;case 62:n="&gt;";break;default:continue}c!==r&&(s+=a.substring(c,r)),c=r+1,s+=n}return c!==r?s+a.substring(c,r):s}
var pug_has_own_property=Object.prototype.hasOwnProperty;
var pug_match_html=/["&<>]/;
function pug_style(r){if(!r)return"";if("object"==typeof r){var t="";for(var e in r)pug_has_own_property.call(r,e)&&(t=t+e+":"+r[e]+";");return t}return r+""}function template(locals) {var pug_html = "", pug_mixins = {}, pug_interp;;
    var locals_for_with = (locals || {});

    (function (analysis, author, date, encodeURIComponent, favicon, isNaN, labelBase, labels, parseInt, postscript, slug, songs, standalone, title, titleHtml, versions) {
      function slugify(text) {
text = text.toLowerCase().trim()
text = text.replace(/[^a-z0-9 -]/g, '')
text = text.replace(/ +/g, '-')
return text;
}
function postscriptPreviewSettings(params) {
const preview = !(params && params.preview === 'false');
let previewLines = parseInt(params && params['preview-lines'], 10);
if (isNaN(previewLines) || previewLines < 1) previewLines = 5;
return { preview, previewLines };
}
function processAnalysisText(text) {
const paragraphs = text.split(/\n\s*\n/).map(para => para.trim()).filter(para => para.length > 0);
const processedParagraphs = paragraphs.map(para => {
if (para.includes('<') && para.includes('>')) {
return para;
} else {
return '<p>' + para + '</p>';
}
});
return processedParagraphs.join('');
}
pug_mixins["processLines"] = pug_interp = function(text){
var block = (this && this.block), attributes = (this && this.attributes) || {};
if (text) {
const lines = text.split('\n')
let index = 0
// iterate lines
;(function(){
  var $$obj = lines;
  if ('number' == typeof $$obj.length) {
      for (var pug_index0 = 0, $$l = $$obj.length; pug_index0 < $$l; pug_index0++) {
        var line = $$obj[pug_index0];
pug_html = pug_html + (null == (pug_interp = line) ? "" : pug_interp);
if (index < lines.length - 1) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
index++
      }
  } else {
    var $$l = 0;
    for (var pug_index0 in $$obj) {
      $$l++;
      var line = $$obj[pug_index0];
pug_html = pug_html + (null == (pug_interp = line) ? "" : pug_interp);
if (index < lines.length - 1) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
index++
    }
  }
}).call(this);

}
};
pug_mixins["poemContent"] = pug_interp = function(){
var block = (this && this.block), attributes = (this && this.attributes) || {};
if (standalone) {
pug_html = pug_html + "\u003Ch2 class=\"poem-title\"\u003E" + (null == (pug_interp = titleHtml) ? "" : pug_interp) + "\u003C\u002Fh2\u003E";
}
pug_html = pug_html + "\u003Cdiv" + (pug_attr("id", `poem--${slug}`, true, false)) + "\u003E\u003Cdiv class=\"poem-info\"\u003E\u003Cspan" + (" class=\"title\""+pug_attr("id", `title--${slug}`, true, false)) + "\u003E" + (null == (pug_interp = titleHtml) ? "" : pug_interp) + "\u003C\u002Fspan\u003E\u003Cbr\u002F\u003E\u003Cspan" + (" class=\"author\""+pug_attr("id", `author--${slug}`, true, false)) + "\u003E" + (pug_escape(null == (pug_interp = author) ? "" : pug_interp)) + "\u003C\u002Fspan\u003E\u003Cbr\u002F\u003E\u003Cspan" + (" class=\"date\""+pug_attr("id", `date--${slug}`, true, false)) + "\u003E" + (pug_escape(null == (pug_interp = date) ? "" : pug_interp)) + "\u003C\u002Fspan\u003E\u003Cbr\u002F\u003E\u003C\u002Fdiv\u003E\u003Cbr\u002F\u003E\u003Cdiv class=\"poem-body\"\u003E";
if (versions && versions.length > 0) {
// iterate versions
;(function(){
  var $$obj = versions;
  if ('number' == typeof $$obj.length) {
      for (var versionIndex = 0, $$l = $$obj.length; versionIndex < $$l; versionIndex++) {
        var version = $$obj[versionIndex];
if (version.label) {
pug_html = pug_html + "\u003Chr\u002F\u003E\u003Cdiv class=\"poem-info\"\u003E" + (null == (pug_interp = version.label) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E";
}
if (version.segments && version.segments.length > 0) {
// iterate version.segments
;(function(){
  var $$obj = version.segments;
  if ('number' == typeof $$obj.length) {
      for (var pug_index2 = 0, $$l = $$obj.length; pug_index2 < $$l; pug_index2++) {
        var segment = $$obj[pug_index2];
if (segment.label) {
pug_html = pug_html + "\u003Cspan class=\"song-segment\"\u003E" + (null == (pug_interp = `[${segment.label}]`) ? "" : pug_interp) + "\u003C\u002Fspan\u003E\u003Cbr\u002F\u003E";
}
if (segment.parts) {
// iterate segment.parts
;(function(){
  var $$obj = segment.parts;
  if ('number' == typeof $$obj.length) {
      for (var pug_index3 = 0, $$l = $$obj.length; pug_index3 < $$l; pug_index3++) {
        var part = $$obj[pug_index3];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
      }
  } else {
    var $$l = 0;
    for (var pug_index3 in $$obj) {
      $$l++;
      var part = $$obj[pug_index3];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
    }
  }
}).call(this);

}
else {
pug_mixins["processLines"](segment.lines);
}
if (segment !== version.segments[version.segments.length - 1]) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
      }
  } else {
    var $$l = 0;
    for (var pug_index2 in $$obj) {
      $$l++;
      var segment = $$obj[pug_index2];
if (segment.label) {
pug_html = pug_html + "\u003Cspan class=\"song-segment\"\u003E" + (null == (pug_interp = `[${segment.label}]`) ? "" : pug_interp) + "\u003C\u002Fspan\u003E\u003Cbr\u002F\u003E";
}
if (segment.parts) {
// iterate segment.parts
;(function(){
  var $$obj = segment.parts;
  if ('number' == typeof $$obj.length) {
      for (var pug_index4 = 0, $$l = $$obj.length; pug_index4 < $$l; pug_index4++) {
        var part = $$obj[pug_index4];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
      }
  } else {
    var $$l = 0;
    for (var pug_index4 in $$obj) {
      $$l++;
      var part = $$obj[pug_index4];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
    }
  }
}).call(this);

}
else {
pug_mixins["processLines"](segment.lines);
}
if (segment !== version.segments[version.segments.length - 1]) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
    }
  }
}).call(this);

}
if (versionIndex < versions.length - 1) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
      }
  } else {
    var $$l = 0;
    for (var versionIndex in $$obj) {
      $$l++;
      var version = $$obj[versionIndex];
if (version.label) {
pug_html = pug_html + "\u003Chr\u002F\u003E\u003Cdiv class=\"poem-info\"\u003E" + (null == (pug_interp = version.label) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E";
}
if (version.segments && version.segments.length > 0) {
// iterate version.segments
;(function(){
  var $$obj = version.segments;
  if ('number' == typeof $$obj.length) {
      for (var pug_index5 = 0, $$l = $$obj.length; pug_index5 < $$l; pug_index5++) {
        var segment = $$obj[pug_index5];
if (segment.label) {
pug_html = pug_html + "\u003Cspan class=\"song-segment\"\u003E" + (null == (pug_interp = `[${segment.label}]`) ? "" : pug_interp) + "\u003C\u002Fspan\u003E\u003Cbr\u002F\u003E";
}
if (segment.parts) {
// iterate segment.parts
;(function(){
  var $$obj = segment.parts;
  if ('number' == typeof $$obj.length) {
      for (var pug_index6 = 0, $$l = $$obj.length; pug_index6 < $$l; pug_index6++) {
        var part = $$obj[pug_index6];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
      }
  } else {
    var $$l = 0;
    for (var pug_index6 in $$obj) {
      $$l++;
      var part = $$obj[pug_index6];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
    }
  }
}).call(this);

}
else {
pug_mixins["processLines"](segment.lines);
}
if (segment !== version.segments[version.segments.length - 1]) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
      }
  } else {
    var $$l = 0;
    for (var pug_index5 in $$obj) {
      $$l++;
      var segment = $$obj[pug_index5];
if (segment.label) {
pug_html = pug_html + "\u003Cspan class=\"song-segment\"\u003E" + (null == (pug_interp = `[${segment.label}]`) ? "" : pug_interp) + "\u003C\u002Fspan\u003E\u003Cbr\u002F\u003E";
}
if (segment.parts) {
// iterate segment.parts
;(function(){
  var $$obj = segment.parts;
  if ('number' == typeof $$obj.length) {
      for (var pug_index7 = 0, $$l = $$obj.length; pug_index7 < $$l; pug_index7++) {
        var part = $$obj[pug_index7];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
      }
  } else {
    var $$l = 0;
    for (var pug_index7 in $$obj) {
      $$l++;
      var part = $$obj[pug_index7];
if (part.type === 'html') {
pug_html = pug_html + (null == (pug_interp = part.html) ? "" : pug_interp);
}
else {
pug_mixins["processLines"](part.lines);
}
    }
  }
}).call(this);

}
else {
pug_mixins["processLines"](segment.lines);
}
if (segment !== version.segments[version.segments.length - 1]) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
    }
  }
}).call(this);

}
if (versionIndex < versions.length - 1) {
pug_html = pug_html + "\u003Cbr\u002F\u003E";
}
    }
  }
}).call(this);

}
else {
pug_html = pug_html + "\u003Cp class=\"no-content\"\u003ENo content available\u003C\u002Fp\u003E";
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
if (labels && labels.length > 0) {
pug_html = pug_html + "\u003Cul class=\"poem-labels\"\u003E";
// iterate labels
;(function(){
  var $$obj = labels;
  if ('number' == typeof $$obj.length) {
      for (var pug_index8 = 0, $$l = $$obj.length; pug_index8 < $$l; pug_index8++) {
        var label = $$obj[pug_index8];
pug_html = pug_html + "\u003Cli\u003E\u003Ca" + (" class=\"poem-label\""+pug_attr("href", `${labelBase || ''}all-poems.html?scope=labels&q=${encodeURIComponent(label)}`, true, false)) + "\u003E" + (pug_escape(null == (pug_interp = label) ? "" : pug_interp)) + "\u003C\u002Fa\u003E\u003C\u002Fli\u003E";
      }
  } else {
    var $$l = 0;
    for (var pug_index8 in $$obj) {
      $$l++;
      var label = $$obj[pug_index8];
pug_html = pug_html + "\u003Cli\u003E\u003Ca" + (" class=\"poem-label\""+pug_attr("href", `${labelBase || ''}all-poems.html?scope=labels&q=${encodeURIComponent(label)}`, true, false)) + "\u003E" + (pug_escape(null == (pug_interp = label) ? "" : pug_interp)) + "\u003C\u002Fa\u003E\u003C\u002Fli\u003E";
    }
  }
}).call(this);

pug_html = pug_html + "\u003C\u002Ful\u003E";
}
if (songs && songs.length > 0) {
pug_html = pug_html + "\u003Cdiv" + (" class=\"song-link\""+pug_attr("id", `song--${slug}`, true, false)) + "\u003E";
// iterate songs
;(function(){
  var $$obj = songs;
  if ('number' == typeof $$obj.length) {
      for (var pug_index9 = 0, $$l = $$obj.length; pug_index9 < $$l; pug_index9++) {
        var song = $$obj[pug_index9];
let songItemClass = `song-item song-item--${song.service}`
if (song.embed) songItemClass += ' song-item-embed'
if (song.link) songItemClass += ' song-item-link'
pug_html = pug_html + "\u003Cdiv" + (pug_attr("class", pug_classes([songItemClass], [true]), false, false)) + "\u003E";
if (song.embed) {
let embedClass = `song-embed song-embed--${song.service}`
if (song.embed.media) embedClass += ` song-embed--${song.service}--${song.embed.media}`
pug_html = pug_html + "\u003Cdiv" + (pug_attr("class", pug_classes([embedClass], [true]), false, false)+pug_attr("data-embed-media", song.embed.media, true, false)) + "\u003E\u003Cbutton" + (" class=\"song-embed-btn\""+pug_attr("id", `song-embed-btn--${song.service}--${slug}`, true, false)+" type=\"button\""+pug_attr("data-embed-src", song.embed.src, true, false)+pug_attr("data-title", song.embed.title, true, false)+pug_attr("data-allow", song.embed.allow, true, false)+pug_attr("data-allow-fullscreen", song.embed.allowFullscreen, true, false)) + "\u003E" + (pug_escape(null == (pug_interp = song.embed.buttonLabel) ? "" : pug_interp)) + "\u003C\u002Fbutton\u003E";
let playerClass = 'song-embed-player hidden'
if (song.embed.sizeIsAspect) playerClass += ' song-embed-player--aspect'
let playerStyle = song.embed.sizeVar ? `${song.embed.sizeVar}: ${song.embed.sizeValue}` : false
pug_html = pug_html + "\u003Cdiv" + (pug_attr("class", pug_classes([playerClass], [true]), false, false)+pug_attr("style", pug_style(playerStyle), true, false)) + "\u003E\u003C\u002Fdiv\u003E\u003C\u002Fdiv\u003E";
}
if (song.link) {
pug_html = pug_html + "\u003Ca" + (pug_attr("class", pug_classes(["song-link-anchor",`song-link--${song.service}`], [false,true]), false, false)+pug_attr("href", song.link.href, true, false)+" target=\"_blank\"") + "\u003E" + (pug_escape(null == (pug_interp = song.link.label) ? "" : pug_interp)) + "\u003C\u002Fa\u003E";
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
      }
  } else {
    var $$l = 0;
    for (var pug_index9 in $$obj) {
      $$l++;
      var song = $$obj[pug_index9];
let songItemClass = `song-item song-item--${song.service}`
if (song.embed) songItemClass += ' song-item-embed'
if (song.link) songItemClass += ' song-item-link'
pug_html = pug_html + "\u003Cdiv" + (pug_attr("class", pug_classes([songItemClass], [true]), false, false)) + "\u003E";
if (song.embed) {
let embedClass = `song-embed song-embed--${song.service}`
if (song.embed.media) embedClass += ` song-embed--${song.service}--${song.embed.media}`
pug_html = pug_html + "\u003Cdiv" + (pug_attr("class", pug_classes([embedClass], [true]), false, false)+pug_attr("data-embed-media", song.embed.media, true, false)) + "\u003E\u003Cbutton" + (" class=\"song-embed-btn\""+pug_attr("id", `song-embed-btn--${song.service}--${slug}`, true, false)+" type=\"button\""+pug_attr("data-embed-src", song.embed.src, true, false)+pug_attr("data-title", song.embed.title, true, false)+pug_attr("data-allow", song.embed.allow, true, false)+pug_attr("data-allow-fullscreen", song.embed.allowFullscreen, true, false)) + "\u003E" + (pug_escape(null == (pug_interp = song.embed.buttonLabel) ? "" : pug_interp)) + "\u003C\u002Fbutton\u003E";
let playerClass = 'song-embed-player hidden'
if (song.embed.sizeIsAspect) playerClass += ' song-embed-player--aspect'
let playerStyle = song.embed.sizeVar ? `${song.embed.sizeVar}: ${song.embed.sizeValue}` : false
pug_html = pug_html + "\u003Cdiv" + (pug_attr("class", pug_classes([playerClass], [true]), false, false)+pug_attr("style", pug_style(playerStyle), true, false)) + "\u003E\u003C\u002Fdiv\u003E\u003C\u002Fdiv\u003E";
}
if (song.link) {
pug_html = pug_html + "\u003Ca" + (pug_attr("class", pug_classes(["song-link-anchor",`song-link--${song.service}`], [false,true]), false, false)+pug_attr("href", song.link.href, true, false)+" target=\"_blank\"") + "\u003E" + (pug_escape(null == (pug_interp = song.link.label) ? "" : pug_interp)) + "\u003C\u002Fa\u003E";
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
    }
  }
}).call(this);

pug_html = pug_html + "\u003C\u002Fdiv\u003E";
}
if (postscript && postscript.length > 0) {
// iterate postscript
;(function(){
  var $$obj = postscript;
  if ('number' == typeof $$obj.length) {
      for (var pug_index10 = 0, $$l = $$obj.length; pug_index10 < $$l; pug_index10++) {
        var postscriptItem = $$obj[pug_index10];
const postscriptId = `postscript-${postscriptItem.label ? slugify(postscriptItem.label) : 'item'}--${slug}`
const { preview, previewLines } = postscriptPreviewSettings(postscriptItem.params)
pug_html = pug_html + "\u003Cdiv" + (" class=\"postscript\""+pug_attr("id", postscriptId, true, false)) + "\u003E";
if (postscriptItem.label) {
pug_html = pug_html + "\u003Cdiv class=\"postscript-label\"\u003E" + (null == (pug_interp = postscriptItem.label) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E";
}
if (postscriptItem.content) {
const processedContent = postscriptItem.content
if (preview) {
const toggleId = `${postscriptId}--more`
const contentId = `${postscriptId}--content`
pug_html = pug_html + "\u003Cdiv" + (" class=\"postscript-content\""+pug_attr("id", contentId, true, false)+pug_attr("style", pug_style(`--preview-lines: ${previewLines}`), true, false)+pug_attr("data-preview-lines", previewLines, true, false)) + "\u003E" + (null == (pug_interp = processedContent) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E\u003Cbutton" + (" class=\"postscript-toggle\""+pug_attr("id", toggleId, true, false)+" type=\"button\" aria-expanded=\"false\""+pug_attr("aria-controls", contentId, true, false)) + "\u003E\u003Cspan class=\"sr-only\"\u003ESee more\u003C\u002Fspan\u003E\u003C\u002Fbutton\u003E";
}
else {
pug_html = pug_html + (null == (pug_interp = processedContent) ? "" : pug_interp);
}
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
      }
  } else {
    var $$l = 0;
    for (var pug_index10 in $$obj) {
      $$l++;
      var postscriptItem = $$obj[pug_index10];
const postscriptId = `postscript-${postscriptItem.label ? slugify(postscriptItem.label) : 'item'}--${slug}`
const { preview, previewLines } = postscriptPreviewSettings(postscriptItem.params)
pug_html = pug_html + "\u003Cdiv" + (" class=\"postscript\""+pug_attr("id", postscriptId, true, false)) + "\u003E";
if (postscriptItem.label) {
pug_html = pug_html + "\u003Cdiv class=\"postscript-label\"\u003E" + (null == (pug_interp = postscriptItem.label) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E";
}
if (postscriptItem.content) {
const processedContent = postscriptItem.content
if (preview) {
const toggleId = `${postscriptId}--more`
const contentId = `${postscriptId}--content`
pug_html = pug_html + "\u003Cdiv" + (" class=\"postscript-content\""+pug_attr("id", contentId, true, false)+pug_attr("style", pug_style(`--preview-lines: ${previewLines}`), true, false)+pug_attr("data-preview-lines", previewLines, true, false)) + "\u003E" + (null == (pug_interp = processedContent) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E\u003Cbutton" + (" class=\"postscript-toggle\""+pug_attr("id", toggleId, true, false)+" type=\"button\" aria-expanded=\"false\""+pug_attr("aria-controls", contentId, true, false)) + "\u003E\u003Cspan class=\"sr-only\"\u003ESee more\u003C\u002Fspan\u003E\u003C\u002Fbutton\u003E";
}
else {
pug_html = pug_html + (null == (pug_interp = processedContent) ? "" : pug_interp);
}
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
    }
  }
}).call(this);

}
if (analysis) {
pug_html = pug_html + "\u003Cbutton" + (" class=\"analysis show\""+pug_attr("id", `show-analysis--${slug}`, true, false)+" type=\"button\""+pug_attr("onclick", `document.getElementById('analysis--${slug}').style.display = 'block'; document.getElementById('show-analysis--${slug}').style.display = 'none';`, true, false)) + "\u003EShow analysis\u003C\u002Fbutton\u003E\u003Cdiv" + (" class=\"analysis\""+pug_attr("id", `analysis--${slug}`, true, false)) + "\u003E\u003Cbutton" + (" class=\"analysis hide\""+pug_attr("id", `hide-analysis--${slug}`, true, false)+" type=\"button\""+pug_attr("onclick", `document.getElementById('analysis--${slug}').style.display = 'none'; document.getElementById('show-analysis--${slug}').style.display = 'block';`, true, false)) + "\u003EHide analysis\u003C\u002Fbutton\u003E";
if (analysis.synopsis && analysis.full) {
pug_html = pug_html + "\u003Cdiv class=\"full-or-synopsis-selector\"\u003E\u003Cbutton" + (" class=\"analysis selector selected\""+pug_attr("id", `analysis-select-syno--${slug}`, true, false)+" type=\"button\""+pug_attr("onclick", `el = name => document.getElementById('analysis-' + name + '--${slug}'); el('full').style.display = 'none'; el('syno').style.display = 'block'; el('select-full').classList.remove('selected'); el('select-syno').classList.add('selected');`, true, false)) + "\u003ESynopsis\u003C\u002Fbutton\u003E\u003Cbutton" + (" class=\"analysis selector\""+pug_attr("id", `analysis-select-full--${slug}`, true, false)+" type=\"button\""+pug_attr("onclick", `el = name => document.getElementById('analysis-' + name + '--${slug}'); el('full').style.display = 'block'; el('syno').style.display = 'none'; el('select-full').classList.add('selected'); el('select-syno').classList.remove('selected');`, true, false)) + "\u003EFull Analysis\u003C\u002Fbutton\u003E\u003C\u002Fdiv\u003E\u003Cdiv" + (pug_attr("id", `analysis-syno--${slug}`, true, false)) + "\u003E\u003Ch2\u003EAnalysis of \u003Cem\u003E" + (null == (pug_interp = titleHtml) ? "" : pug_interp) + "\u003C\u002Fem\u003E (synopsis)\u003C\u002Fh2\u003E";
const processedSynopsis = processAnalysisText(analysis.synopsis)
pug_html = pug_html + (null == (pug_interp = processedSynopsis) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E\u003Cdiv" + (" class=\"hidden\""+pug_attr("id", `analysis-full--${slug}`, true, false)) + "\u003E\u003Ch2\u003EAnalysis of \u003Cem\u003E" + (null == (pug_interp = titleHtml) ? "" : pug_interp) + "\u003C\u002Fem\u003E\u003C\u002Fh2\u003E";
const processedFull = processAnalysisText(analysis.full)
pug_html = pug_html + (null == (pug_interp = processedFull) ? "" : pug_interp) + "\u003C\u002Fdiv\u003E";
}
else {
pug_html = pug_html + "\u003Ch2\u003EAnalysis of \u003Cem\u003E" + (null == (pug_interp = titleHtml) ? "" : pug_interp) + "\u003C\u002Fem\u003E\u003C\u002Fh2\u003E";
const processedFull = processAnalysisText(analysis.full)
pug_html = pug_html + (null == (pug_interp = processedFull) ? "" : pug_interp);
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
};
pug_html = pug_html + "\u003C!DOCTYPE html\u003E\u003Chtml lang=\"en\"\u003E\u003Chead\u003E\u003Cmeta charset=\"utf-8\"\u003E\u003Cmeta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"\u003E\u003Ctitle\u003E" + (pug_escape(null == (pug_interp = title) ? "" : pug_interp)) + "\u003C\u002Ftitle\u003E\u003Clink" + (" rel=\"icon\""+pug_attr("href", `../${favicon}`, true, true)) + "\u003E\u003Clink rel=\"stylesheet\" href=\"..\u002Fpoetic.css\"\u003E\u003Clink rel=\"stylesheet\" href=\"..\u002Fcustom.css\"\u003E\u003Cscript" + (" src=\"..\u002Fpoetic.js\""+pug_attr("defer", true, true, true)) + "\u003E\u003C\u002Fscript\u003E\u003C\u002Fhead\u003E\u003Cbody\u003E\u003Cdiv class=\"container\"\u003E\u003Cnav class=\"poem-page-nav\"\u003E\u003Ca href=\"..\u002F\"\u003E← Poems\u003C\u002Fa\u003E ·&nbsp;\u003Ca href=\"..\u002Fall-poems.html\"\u003EAll Poems\u003C\u002Fa\u003E\u003C\u002Fnav\u003E\u003Cdiv" + (" class=\"poem-section\""+pug_attr("id", `poem-${slug}`, true, true)) + "\u003E\u003Ch2 class=\"poem-title\"\u003E" + (null == (pug_interp = titleHtml) ? "" : pug_interp) + "\u003C\u002Fh2\u003E\u003Cdiv class=\"poem-content\"\u003E";
pug_mixins["poemContent"]();
pug_html = pug_html + "\u003C\u002Fdiv\u003E\u003C\u002Fdiv\u003E\u003C\u002Fdiv\u003E\u003C\u002Fbody\u003E\u003C\u002Fhtml\u003E";
    }.call(this, "analysis" in locals_for_with ?
        locals_for_with.analysis :
        typeof analysis !== 'undefined' ? analysis : undefined, "author" in locals_for_with ?
        locals_for_with.author :
        typeof author !== 'undefined' ? author : undefined, "date" in locals_for_with ?
        locals_for_with.date :
        typeof date !== 'undefined' ? date : undefined, "encodeURIComponent" in locals_for_with ?
        locals_for_with.encodeURIComponent :
        typeof encodeURIComponent !== 'undefined' ? encodeURIComponent : undefined, "favicon" in locals_for_with ?
        locals_for_with.favicon :
        typeof favicon !== 'undefined' ? favicon : undefined, "isNaN" in locals_for_with ?
        locals_for_with.isNaN :
        typeof isNaN !== 'undefined' ? isNaN : undefined, "labelBase" in locals_for_with ?
        locals_for_with.labelBase :
        typeof labelBase !== 'undefined' ? labelBase : undefined, "labels" in locals_for_with ?
        locals_for_with.labels :
        typeof labels !== 'undefined' ? labels : undefined, "parseInt" in locals_for_with ?
        locals_for_with.parseInt :
        typeof parseInt !== 'undefined' ? parseInt : undefined, "postscript" in locals_for_with ?
        locals_for_with.postscript :
        typeof postscript !== 'undefined' ? postscript : undefined, "slug" in locals_for_with ?
        locals_for_with.slug :
        typeof slug !== 'undefined' ? slug : undefined, "songs" in locals_for_with ?
        locals_for_with.songs :
        typeof songs !== 'undefined' ? songs : undefined, "standalone" in locals_for_with ?
        locals_for_with.standalone :
        typeof standalone !== 'undefined' ? standalone : undefined, "title" in locals_for_with ?
        locals_for_with.title :
        typeof title !== 'undefined' ? title : undefined, "titleHtml" in locals_for_with ?
        locals_for_with.titleHtml :
        typeof titleHtml !== 'undefined' ? titleHtml : undefined, "versions" in locals_for_with ?
        locals_for_with.versions :
        typeof versions !== 'undefined' ? versions : undefined));
    ;;return pug_html;}
return template;
})();

module.exports = { renderFragmentTemplate, renderPageTemplate };
