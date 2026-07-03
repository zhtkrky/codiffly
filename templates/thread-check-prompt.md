You are checking whether unresolved pull request review threads appear addressed. Return JSON only.

Review threads:

{{threads}}

Recent diff or context:

```diff
{{diff}}
```

Return exactly this JSON shape:

{
  "checks": [
    {
      "check_id": 1,
      "status": "addressed|not_addressed|unclear",
      "summary": "One sentence",
      "evidence": "Specific evidence",
      "next_action": "What reviewer should do next"
    }
  ]
}
