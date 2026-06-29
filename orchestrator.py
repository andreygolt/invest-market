#!/usr/bin/env python3
"""
Harness: Claude Code (архитектор) ↔ Codex (исполнитель)

Цикл:
  1. Claude пишет CODEX_T{N}_TASK.md
  2. Codex реализует, пишет DONE: T{N} в progress.md
  3. Claude читает progress.md, ревьюит, пишет CODEX_T{N+1}_TASK.md
  4. Goto 2

Запуск:
  python3 orchestrator.py        # ждёт DONE в progress.md (Codex уже запущен)
  python3 orchestrator.py 1      # пишет T1 (если нет), запускает Codex, дальше автономно
  python3 orchestrator.py 5      # стартует с T5
"""

import os
import re
import subprocess
import time
import glob
import sys
from datetime import datetime

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
PROGRESS_FILE = os.path.join(PROJECT_DIR, "progress.md")
LOG_FILE = os.path.join(PROJECT_DIR, "orchestrator.log")

CLAUDE_BIN = "/Users/andrey/.local/bin/claude"

# Список аккаунтов Codex для ротации при лимитах.
CODEX_ACCOUNTS = [
    "/Users/andrey/.vscode/extensions/openai.chatgpt-26.623.31921-darwin-arm64/bin/macos-aarch64/codex",
    "/Users/andrey/.vscode/extensions/openai.chatgpt-26.616.81150-darwin-arm64/bin/macos-aarch64/codex",
    # "/Users/BROTHER/.vscode/extensions/openai.chatgpt-.../codex",  # второй аккаунт
]
_account_idx = 0

# Контекст проекта — передаётся Claude в каждом промпте
PROJECT_CONTEXT = """
ПРОЕКТ: invest_market — закрытый инвестиционный маркет с AI-андеррайтингом.
НАЗНАЧЕНИЕ: Проекты проходят AI-анкету → загружают документы → AI-анализ → модерация → инвесторы видят deal room → заявки → сделки вне платформы.

СТЕК:
  Next.js 14 + TypeScript + App Router
  shadcn/ui + Tailwind CSS
  Supabase (PostgreSQL + Auth + Storage + RLS)
  OpenAI GPT-4o structured outputs
  Vercel деплой

СТРУКТУРА:
  app/(auth)/          — login, invite регистрация
  app/(investor)/      — кабинет инвестора
  app/(project)/       — кабинет проекта
  app/(admin)/         — админ-панель
  app/api/             — API routes
  components/          — shared UI
  lib/supabase/        — client.ts, server.ts, admin.ts
  lib/ai/              — AI промпты, pipeline
  supabase/migrations/ — SQL миграции
  types/               — TypeScript типы
  __tests__/           — Jest тесты

ТЕСТЫ: cd invest_market && npm test
СБОРКА: cd invest_market && npm run build
ЛИНТ: cd invest_market && npm run lint

ПРАВИЛА:
  - NO новых npm-зависимостей без явного ТЗ
  - Миграции только аддитивные (ALTER TABLE ADD COLUMN, CREATE TABLE IF NOT EXISTS)
  - RLS обязателен на каждой новой таблице
  - TypeScript strict — никаких any
  - Каждый новый API route → тест
  - shadcn/ui компоненты — использовать готовые
  - Дисклеймеры обязательны везде где упоминается доходность

РОЛИ: superadmin, admin, moderator, manager, investor, project
ПЛАТФОРМА НЕ ПРИНИМАЕТ ДЕНЬГИ. Сделки вне платформы.
""".strip()


def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def get_latest_task_num() -> int:
    files = glob.glob(os.path.join(PROJECT_DIR, "CODEX_T*_TASK.md"))
    nums = [int(m.group(1)) for f in files for m in [re.search(r"CODEX_T(\d+)_TASK\.md", f)] if m]
    return max(nums) if nums else 0


def task_file_path(n: int) -> str:
    return os.path.join(PROJECT_DIR, f"CODEX_T{n}_TASK.md")


def task_file_exists(n: int) -> bool:
    return os.path.exists(task_file_path(n))


def read_progress() -> str:
    try:
        return open(PROGRESS_FILE).read()
    except FileNotFoundError:
        return ""


def get_done_task() -> int | None:
    m = re.search(r"DONE:\s*T(\d+)", read_progress(), re.IGNORECASE)
    return int(m.group(1)) if m else None


def clear_done_signal(n: int) -> None:
    content = read_progress()
    content = re.sub(r"DONE:\s*T\d+\s*\n?", f"REVIEWED: T{n}\n", content, flags=re.IGNORECASE)
    with open(PROGRESS_FILE, "w") as f:
        f.write(content)


def run_claude(prompt: str, timeout: int = 600) -> tuple[bool, str]:
    """Запустить Claude Code в non-interactive режиме."""
    log(f"Claude: {prompt[:80]}...")
    env = os.environ.copy()
    env["PATH"] = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:" + env.get("PATH", "")
    try:
        result = subprocess.run(
            [CLAUDE_BIN, "--dangerously-skip-permissions", "-p", prompt],
            cwd=PROJECT_DIR,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
        )
        if result.returncode == 0:
            return True, result.stdout
        log(f"Claude ошибка (rc={result.returncode}): {result.stderr[:300]}")
        log(f"Claude stdout: {result.stdout[:300]}")
        return False, result.stderr + result.stdout
    except subprocess.TimeoutExpired:
        log(f"Claude timeout ({timeout}s)")
        return False, "timeout"
    except Exception as e:
        log(f"Claude исключение: {e}")
        return False, str(e)


def _rotate_account(reason: str = "") -> bool:
    global _account_idx
    if len(CODEX_ACCOUNTS) <= 1:
        return False
    _account_idx = (_account_idx + 1) % len(CODEX_ACCOUNTS)
    log(f"Ротация аккаунта → [{_account_idx}] {CODEX_ACCOUNTS[_account_idx]} ({reason})")
    return True


def run_codex(n: int, timeout: int = 900) -> bool:
    """Запустить Codex на задачу T{n}. При лимите — ротация аккаунта."""
    global _account_idx
    task_path = task_file_path(n)

    prompt = (
        f"Читай invest_market/AGENTS.md. "
        f"Читай {task_path}. "
        f"Реализуй точно по ТЗ — ничего лишнего. "
        f"После реализации запусти из папки invest_market/: "
        f"npm run build && npm run lint && npm test. "
        f"Если есть ошибки — исправь. "
        f"Когда всё чисто — добавь строку 'DONE: T{n}' в самое начало файла "
        f"invest_market/progress.md (перед всем остальным текстом)."
    )

    for attempt_num in range(len(CODEX_ACCOUNTS)):
        codex_bin = CODEX_ACCOUNTS[_account_idx]
        log(f"Codex[{_account_idx}] → T{n} (попытка {attempt_num + 1}/{len(CODEX_ACCOUNTS)})...")
        try:
            env = os.environ.copy()
            env["PATH"] = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:" + env.get("PATH", "")
            result = subprocess.run(
                [codex_bin, "exec", "--dangerously-bypass-approvals-and-sandbox", prompt],
                cwd=os.path.dirname(PROJECT_DIR),
                capture_output=True,
                text=True,
                timeout=timeout,
                env=env,
            )
            if result.returncode == 0:
                log(f"Codex[{_account_idx}] завершил T{n} (rc=0)")
                return True

            stderr = result.stderr[:300]
            log(f"Codex[{_account_idx}] ошибка T{n} (rc={result.returncode}): {stderr}")

            limit_signals = ["rate limit", "quota", "token limit", "exceeded", "429", "insufficient_quota"]
            hit_limit = any(s in (result.stdout + result.stderr).lower() for s in limit_signals)
            if hit_limit and _rotate_account("лимит токенов"):
                continue

            with open(PROGRESS_FILE, "a") as f:
                f.write(f"\n## Ошибка Codex T{n}\n```\n{result.stderr[:800]}\n```\n")
            return False

        except subprocess.TimeoutExpired:
            log(f"Codex[{_account_idx}] timeout T{n} ({timeout}s)")
            if _rotate_account("timeout"):
                continue
            return False
        except Exception as e:
            log(f"Codex[{_account_idx}] исключение: {e}")
            return False

    log(f"Все аккаунты исчерпаны для T{n}")
    return False


def write_task(n: int) -> bool:
    """Claude Code пишет CODEX_T{n}_TASK.md на основе прогресса."""
    prev = n - 1
    prev_task_content = ""
    if task_file_exists(prev):
        try:
            prev_task_content = (
                f"\nФормат предыдущего ТЗ (T{prev}) — придерживайся его:\n"
                f"```\n{open(task_file_path(prev)).read()[:2000]}\n```"
            )
        except Exception:
            pass

    prompt = f"""{PROJECT_CONTEXT}

Твоя задача: написать ТЗ для Codex — файл invest_market/CODEX_T{n}_TASK.md.

Сначала прочитай:
1. invest_market/progress.md — что уже сделано, roadmap
2. invest_market/AGENTS.md — правила и структура проекта
3. Файлы, которые уже существуют в invest_market/ — чтобы понять текущее состояние
{prev_task_content}

По roadmap из progress.md определи СЛЕДУЮЩУЮ задачу T{n}.
Напиши подробное ТЗ в файл invest_market/CODEX_T{n}_TASK.md:

ФОРМАТ ТЗ:
- Заголовок: # ТЗ T{n} — [Название]
- Дата, текущее кол-во тестов, размер (S/M/L), зависимости от предыдущих T
- ## Зачем это нужно (1-2 абзаца продуктового смысла)
- ## Что НЕ делаем в этом этапе
- ## Шаг N — [конкретные шаги с кодом]
- ## Тесты (что писать, сколько ожидается)
- ## Команды проверки
- ## Критерии готовности (numbered list)
- ## Что НЕ трогать
- ## Формат отчёта (шаблон для progress.md)

ВАЖНО: ТЗ должно быть достаточно детальным чтобы Codex реализовал без вопросов.
Включай реальный код (TypeScript/SQL/API routes) где нужно.
Один этап = один логичный модуль.

После записи файла выведи: "T{n} ТЗ написано: [краткое название задачи]"
"""
    ok, out = run_claude(prompt, timeout=600)
    if ok and task_file_exists(n):
        log(f"T{n} ТЗ создано: {out.strip()[-150:]}")
        return True
    log(f"T{n} ТЗ НЕ создано. Claude output: {out[:200]}")
    return False


def build_check() -> tuple[bool, str]:
    """Запускает npm run build локально — без Claude."""
    try:
        result = subprocess.run(
            ["/usr/local/bin/npm", "run", "build"],
            cwd=PROJECT_DIR,
            capture_output=True,
            text=True,
            timeout=180,
        )
        ok = result.returncode == 0
        out = (result.stdout + result.stderr)[-400:]
        return ok, out
    except Exception as e:
        return False, str(e)


def review_task(done_n: int) -> bool:
    """Проверяет build локально (без Claude). Если OK — пишет ТЗ через Claude только если файла нет."""
    next_n = done_n + 1

    # Шаг 1: build без Claude
    log(f"Build-проверка T{done_n}...")
    ok, build_out = build_check()
    if not ok:
        log(f"Build упал после T{done_n}. Вывод:\n{build_out}")
        # Только в случае ошибки зовём Claude починить
        fix_prompt = (
            f"Build сломан после T{done_n}. Ошибка:\n{build_out}\n\n"
            f"Почини TypeScript/ESLint ошибки в invest_market/. "
            f"После исправления запусти npm run build и убедись что проходит. "
            f"Не меняй логику — только исправь ошибки типов и импортов."
        )
        fix_ok, _ = run_claude(fix_prompt, timeout=300)
        if fix_ok:
            ok, build_out = build_check()
        if not ok:
            log("Build не починен. Останавливаюсь.")
            return False

    log(f"Build OK после T{done_n}")

    # Шаг 2: если ТЗ для следующей задачи уже есть — не зовём Claude
    if task_file_exists(next_n):
        log(f"T{next_n} ТЗ уже существует → пропускаю ревью Claude")
        return True

    # Шаг 3: Claude пишет только ТЗ (не ревьюит код)
    prompt = (
        f"{PROJECT_CONTEXT}\n\n"
        f"Build прошёл. T{done_n} завершён.\n\n"
        f"Прочитай invest_market/progress.md и определи следующую задачу T{next_n} по roadmap.\n"
        f"Напиши ТЗ в файл invest_market/CODEX_T{next_n}_TASK.md.\n\n"
        f"ТЗ должно содержать:\n"
        f"- Заголовок, цель задачи\n"
        f"- Конкретные файлы для создания/изменения\n"
        f"- Код (TypeScript/SQL) который нужно написать\n"
        f"- Команды проверки\n\n"
        f"ВАЖНО: Если файл CODEX_T{next_n}_TASK.md уже существует — не перезаписывай, выведи 'SKIP'.\n"
        f"После записи выведи: 'REVIEW_OK: T{next_n} написан'"
    )
    ok, out = run_claude(prompt, timeout=400)
    if task_file_exists(next_n):
        log(f"Ревью OK → T{next_n} создан")
        return True
    log(f"Ревью провалилось. Output: {out[-200:]}")
    return False


def main() -> None:
    start_n: int | None = None
    if len(sys.argv) > 1:
        try:
            start_n = int(sys.argv[1])
        except ValueError:
            print("Использование: python3 orchestrator.py [номер_задачи]")
            sys.exit(1)

    log("=" * 60)
    log("INVEST MARKET HARNESS ЗАПУЩЕН. Ctrl+C для остановки.")
    log(f"Проект: {PROJECT_DIR}")
    log(f"Лог: {LOG_FILE}")

    if start_n:
        log(f"Режим: старт с T{start_n}")
        if not task_file_exists(start_n):
            log(f"CODEX_T{start_n}_TASK.md не найден → Claude пишет ТЗ...")
            ok = write_task(start_n)
            if not ok:
                log("Не удалось написать ТЗ. Останавливаюсь.")
                return

        ok = run_codex(start_n)
        if not ok:
            log(f"Codex завершил T{start_n} с ошибкой. Жду DONE сигнал...")

    log("Жду DONE сигнала в progress.md (каждые 5 сек)...")
    last_done: int | None = None

    while True:
        done_n = get_done_task()

        if done_n and done_n != last_done:
            log(f"DONE: T{done_n} → запускаю ревью")
            last_done = done_n
            clear_done_signal(done_n)

            ok = review_task(done_n)
            if not ok:
                log("Ревью провалилось. Останавливаюсь — проверь progress.md")
                break

            next_n = done_n + 1
            time.sleep(2)

            if task_file_exists(next_n):
                ok = run_codex(next_n)
                if not ok:
                    log(f"Codex T{next_n} упал. Жду DONE на случай если он всё же записал результат...")
            else:
                log(f"CODEX_T{next_n}_TASK.md не появился. Останавливаюсь.")
                break

        time.sleep(5)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Harness остановлен (Ctrl+C).")
