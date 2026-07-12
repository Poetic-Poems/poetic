// AUTO-GENERATED — do not edit by hand.
// Source: src/song-handlers.yaml
// Regenerate: npm run build:generated  (src/tools/build-song-handlers-data.js)
//
// Plain-data module of the framework's builtin song handlers, emitted so
// song-handlers.js can load them with no `fs` (keeping it browser-safe —
// see src/browser/render.js).

'use strict';

module.exports = {
  "audiomack": {
    "embed_url": "https://audiomack.com/embed/{artist}/song/{value|slug}",
    "button_label": "🎵 Load Audiomack Player",
    "embed_height": "252px",
    "value_patterns": [
      {
        "match": "^(?:(?:https?://)?(?:www\\.)?audiomack\\.com/)?(?:embed/)?(?<artist>[^/?#]+)/(?:song/)?(?<value>[^/?#]+)/?$"
      }
    ]
  },
  "suno": {
    "link_url": "https://suno.com/{value}",
    "link_label": "recording on Suno",
    "value_patterns": [
      {
        "match": "^(?:(?:https?://)?(?:www\\.)?suno\\.com/)?(?<value>(?:s|song)/.+)$"
      },
      {
        "match": "^(?<id>[A-Za-z0-9]{16})$",
        "value": "s/{id}"
      },
      {
        "match": "^(?<uuid>[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$",
        "value": "song/{uuid}"
      }
    ]
  },
  "mega": {
    "embed_url": "https://mega.nz/embed/{value}",
    "button_label": "🎵 Load MEGA Player",
    "default_media": "audio",
    "media_sizes": {
      "audio": {
        "aspect_ratio": "1 / 1"
      },
      "video": {
        "aspect_ratio": "16 / 9"
      }
    },
    "value_patterns": [
      {
        "match": "^(?:(?:https?://)?(?:www\\.)?mega\\.nz/)?(?:file/)?(?<value>[^/?#]+#.+)$"
      }
    ]
  }
};
