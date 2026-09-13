# BB-привязки моделей

Снимок каталога 2026-09-13; переносимая конфигурация без host IDs. Для другой установки проверить каталог, не заменять BB ID именем компании. Это BB, не API-конфиг.

| model | provider | effort |
|---|---|---|
| gpt-5.6-luna | codex | high, max |
| gpt-5.6-terra | codex | low, medium, high, xhigh, max, ultra |
| gpt-5.6-sol | codex | low, medium, high, xhigh, max, ultra |
| gpt-6-astra | codex | low, medium, high, xhigh, max, ultra |
| claude-opus-5[1m] | claude-code | low, medium, high, xhigh, max, ultracode |
| claude-fable-5-1 | claude-code | low, medium, high, xhigh, max, ultracode |
| claude-sonnet-5 | claude-code | low, medium, high, xhigh, max, ultracode |
| gemini-3.8-flash | acp-antigravity | low, medium, high |
| grok-4.6 | acp-cursor | low, medium, high, xhigh |

Requested serviceTier: `default`, у Luna обязательно `fast`. Effective настройка неизвестна до проверки запуска и хранится отдельно, например `effective: null`. `unverified` не является запрашиваемым serviceTier. Неизвестный model/provider не принимать как готовую конфигурацию. Вне BB нужен отдельный проверенный адаптер; текущий компилятор принимает только эти BB-привязки.
