# Хранение задач агентства

Локальный контракт 0.2. Верхний уровень — [папки направлений и общие знания](agency-project.md). Описанная ниже папка задачи — журнал исполнения; принятые материалы размещаются в папках направлений, а artifacts.json хранит ссылки без дублирования. Для существующей схемы work/tasks/deliverables сохраняется ссылка на её прежний путь, миграция не обязательна. Материалы заказа принадлежат проекту клиента. Путь по умолчанию `<project-root>/work/tasks/<task-id>/`; project-root и host подтверждаются перед созданием. `<task-id>` — экземпляр заказа, например `seo-semantics-2026-09`; `type=SEO-01` — тип из карты. Для существующих Reels/Insights и репозитория кода использовать прежние пути, manifest содержит ссылки вместо копий.

```text
project.json                         # указывает canonical root, host, общие материалы
work/tasks/<task-id>/
  task.json                          # цель, входы, модели, приёмка, ограничения
  sources.json                       # реестр источников и снимков
  artifacts.json                     # реестр артефактов + accepted ID
  inputs/                            # только переданные файлы; внешние — ссылки в task
  raw/<run-id>/<service>/             # неизменяемые исходные выгрузки
  data/                              # нормализованные JSON/JSONL/CSV
  analysis/                          # утверждения, гипотезы, расчёты
  deliverables/<version>/             # при прежнем контракте; новый результат — в направлении
  checks/<run-id>.json                # что проверено, как, исход
  runs/<run-id>/                      # prompt.md, requested/effective config, usage
  handoff.md                         # текущее состояние и следующий шаг
```

Создавать папки по необходимости. `node scripts/scaffold.cjs <существующий-project-root> <task-id> <task-type>` создаёт минимальный draft, не подключает сервисы. Отказывается перезаписывать задачу и выходить через symlink за корень. Это заготовка, не планировщик и не полноценная БД.

`project.json`: project_id, host, canonical_root, shared_refs, existing_contracts. Если отсутствует — агент создаёт после проверки окружения; скрипт не угадывает host. История BB и токены доступа не копируются в папки задач. Код остаётся в репозитории: artifact содержит repo/path/commit или diff, а не дубликат исходников.

`sources.json`: для каждого source_id указать service/URL, retrieved_at, период, регион/язык/устройство, объект/property, безопасные параметры запроса без auth, raw_path, sha256, coverage, retrieval_status. Счётчик в интерфейсе не доказывает полноту API. Ошибки доступа записывать статусом, не пустой успешной выборкой.

`artifacts.json`: artifacts = [{id, path либо external_ref, kind, schema_version, source_ids, producer_run, sha256, status}], accepted = [id]. Статусы draft/reviewed/accepted не взаимозаменяемы. Новая версия отдельным путём, accepted меняется после приёмки; данные не дублируются в final/latest-копиях. Зависимые задачи хранят artifact ID + версию/хеш.

`runs`: timestamp, task_id, provider, requested/effective model/effort/serviceTier, prompt_version/hash, tools_used, elapsed_seconds, tokens, retries, observed_quota, estimated_api_cost. Неизвестные расходы null. API estimate и расход подписки разные поля. Промпт не способен подтвердить effective config.

## Пример SEO: семантика и интенты

1. Wordstat/keyword provider → спрос и расширение запросов. Яндекс переносит функциональность в Search API; сначала проверить, к какому API привязан существующий инструмент. Новый платный облачный доступ не включать автоматически. Источник: [Wordstat API](https://yandex.ru/support2/wordstat/ru/content/api-wordstat), [Search API Wordstat](https://aistudio.yandex.ru/ru/docs/search-api/concepts/wordstat).
2. Search Console → показы/клики/CTR/позиция собственного сайта по доступной выборке, не частотность всего рынка. API может возвращать верхние строки, не все данные: [Search Analytics](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).
3. Яндекс.Вебмастер → запросы и поисковые показатели подтверждённого сайта; сверять семантику конкретного отчёта. Не складывать с GSC без раздельных измерений.
4. SERP/browser/API → датированный снимок выдачи по запросу, региону и устройству для решения спорного интента. Wordstat сам по себе не доказывает интент. Search snippets не заменяют чтение нужной страницы.
5. Краулер/репозиторий → существующие URL и связи. Модель → классификация и гипотезы, с evidence и uncertainty.

Нормализованные `data/queries.jsonl`: query_id, text, normalized_text, language, measurements=[{metric,value,unit,source_id,region,period,match_type}]. Неизвестное null, не 0. Отдельно `data/intents.jsonl`: query_id, intent, evidence_source_ids, method, confidence_label, review_needed. Число confidence не выдавать за калиброванную вероятность. Не схлопывать разные регионы, периоды, операторы Wordstat и разные сервисы в одну частотность.

Результат: `deliverables/v1/semantic-map.json` и удобный CSV + `analysis/decisions.md`; приёмка проверяет referential integrity query/source IDs, реальные метрики, покрытие, дублеты, спорные интенты. Измерения и классы не смешиваются.

Привязка инструмента в task.tools: `{capability, service, binding:null, status:"unverified", fallback:"manual_export"}`. До выполнения проверить каталог, read-only запрос и доступ к нужному объекту. Если API отсутствует, использовать предоставленную выгрузку с метаданными. Не объявлять возможности OhMySEO/MetaMCP рабочими только потому, что их имя есть в документации.

## Артефакты других направлений

| Направление | Рабочие данные | Принимаемый результат |
|---|---|---|
| Бриф/аккаунтинг | inputs/transcript, data/decisions.json | brief.md, scope.json |
| Исследование | raw/sources, analysis/claims.jsonl | dossier.md, sources.json |
| Стратегия | data/segments.json, analysis/hypotheses.json | strategy.md, experiments.json |
| SEO | queries.jsonl, intents.jsonl, crawl.jsonl | semantic-map.json/csv, page-map.json |
| Контент | data/facts.json, analysis/outline.md | article.md, editorial-check.json |
| Реклама | data/campaigns.json, creatives.json | campaign-plan.json, copy.csv |
| Дизайн | inputs/brand, analysis/states.json | макет/URL, tokens.json, review.md |
| Сайты | ссылки на repo и preview, data/pages.json | diff/commit, проверки, инструкция |
| ПО/скрипты | repo refs, analysis/spec.md | код в repo, checks, usage.md |
| Аналитика | raw/reports, data/events.json | расчёты/ноутбук, report.md |
| Соцсети | data/posts.json, schedule.json | content-plan.csv, assets refs |
| Видео | прежний reels/job контракт | final media refs, captions, checks |
| CRM/email | data/segments.json, flow.json | шаблоны, automation refs |
| E-commerce | data/products.jsonl, feed schema | feed, product copy, checks |
| Операции | data/objects.json, before refs | after refs, runbook, rollback |
| Поддержка | raw/incident refs, analysis/diagnosis | resolution.md, проверки восстановления |

Все 128 типов наследуют общую структуру; дополнительные файлы определяются output конкретной задачи. Неизвестная услуга сначала декомпозируется. Полное покрытие маршрутизатором означает наличие процедуры определения/передачи задачи, а не гарантию выполнения любой работы моделью.
