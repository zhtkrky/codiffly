You are reviewing a unified diff. Return JSON only.

Rubric: {{rules}}

Review focus:

{{focusContext}}

Rule-specific context for matching files:

{{ruleContext}}

Use only these valid changed-line targets. Every comment must use a listed target_id.

{{targets}}

Return exactly this JSON shape:

{
  "comments": [
    {
      "target_id": 123,
      "body": "Concise review comment",
      "severity": "blocking|suggestion|question|nit"
    }
  ]
}

Prefer a small number of high-signal comments. Do not comment on unchanged lines. Do not invent files or lines.

Unified diff:

```diff
{{diff}}
```
