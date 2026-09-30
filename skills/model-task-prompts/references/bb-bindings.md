# BB-привязки моделей

Активные привязки обновлены 2026-09-30; переносимая конфигурация без host IDs. GPT‑6.1 Sol доступна в текущей среде Codex и описана в официальной документации; успешный запуск через BB отдельно не проверен. Привязки других провайдеров — снимок каталога 2026-09-13. Для другой установки проверить каталог, не заменять BB ID именем компании. Это BB, не API-конфиг.

| model | provider | effort |
|---|---|---|
| gpt-6.1-sol | codex | low, medium, high, xhigh, max |
| claude-opus-5[1m] | claude-code | low, medium, high, xhigh, max, ultracode |
| claude-fable-5-1 | claude-code | low, medium, high, xhigh, max, ultracode |
| claude-sonnet-5 | claude-code | low, medium, high, xhigh, max, ultracode |
| gemini-3.8-flash | acp-antigravity | low, medium, high |
| grok-4.6 | acp-cursor | low, medium, high, xhigh |

Политика маршрутизации: `gpt-6.1-sol`, effort `high`, усиление `xhigh`, requested serviceTier `default`. Поддержка других effort в компиляторе не меняет назначения профилей. Fast необязателен. Effective настройка неизвестна до проверки запуска и хранится отдельно, например `effective: null`. `unverified` не является запрашиваемым serviceTier. Неизвестный model/provider не принимать как готовую конфигурацию. Вне BB нужен отдельный проверенный адаптер; текущий компилятор принимает только эти BB-привязки. Проверка формы не доказывает доступность модели или применение настроек в BB. [Модель и режимы](https://developers.openai.com/api/docs/models/gpt-6.1-sol).
