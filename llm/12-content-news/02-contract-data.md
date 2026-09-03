# Этап 2. Content contracts и data model

## Промпт агенту

Ты — CMS/API architect. Add reader/editor contracts and provenance model.

## Выполни

- Public feed/article/search/bookmark endpoints and `/admin/content` source/candidate/revision/publish endpoints.
- Models: `ContentSource`, `IngestCandidate`, `Article`, `ArticleRevision`, `Tag`, `Bookmark`, media references.
- Status machine, scheduled publication, canonical slug/version, unique source URL/hash and safe sanitized rich-content format.
- Events for publish/unpublish without article body; SEO metadata and attribution are explicit DTO fields.

## Приёмка

Stored rich text cannot execute scripts; bookmark unique constraint is idempotent; unpublished content is inaccessible publicly.
