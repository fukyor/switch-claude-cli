#!/usr/bin/env bash

if [ $# -ne 0 ]; then
    echo "用法: 将问题输入到./prompt.md"
    exit 1
fi

if [ ! -s ./prompt.md ]; then
    echo "./prompt.md 不存在或为空"
    exit 1
fi

{
    cat ./prompt.md
    printf '\n\n重要: 每次修改完代码都需要进行相应的测试，并保证所有测试通过，测试目录在 codextest。\n'
} | codex -a never exec --sandbox danger-full-access -

EXIT_CODE=$?

while [ "$EXIT_CODE" -ne 0 ]; do
    echo "任务未完成或中断，退出码: $EXIT_CODE，正在 resume --last ..."
    codex -a never exec --sandbox danger-full-access resume --last "继续执行未完成的任务，直到最终结束。重要: 每次修改
完代码都需要进行相应的测试，并保证所有测试通过，测试目录在 codextest"
    EXIT_CODE=$?
done

echo "Codex 任务循环结束"