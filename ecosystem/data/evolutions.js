// Evolution data — inlined from evolutions.json
// To regenerate: node scripts/sync-data.js
export const EVOLUTIONS = {
  chains: [
    {
      id: 'callback_chain',
      name: 'Async Evolution',
      stages: [
        {
          monsterId: 2,
          name: 'CallbackHell'
        },
        {
          monsterId: 23,
          name: 'PromiseChain'
        },
        {
          monsterId: 24,
          name: 'AsyncAwait'
        }
      ],
      triggers: [
        {
          from: 2,
          to: 23,
          condition: {
            event: 'commits',
            count: 10
          },
          description: 'Make 10 commits'
        },
        {
          from: 23,
          to: 24,
          condition: {
            event: 'prs_merged',
            count: 3
          },
          description: 'Merge 3 pull requests'
        }
      ]
    },
    {
      id: 'null_chain',
      name: 'Type Safety Evolution',
      stages: [
        {
          monsterId: 1,
          name: 'NullPointer'
        },
        {
          monsterId: 21,
          name: 'OptionalChaining'
        },
        {
          monsterId: 22,
          name: 'TypeSafety'
        }
      ],
      triggers: [
        {
          from: 1,
          to: 21,
          condition: {
            event: 'bugs_fixed',
            count: 5
          },
          description: 'Fix 5 bugs'
        },
        {
          from: 21,
          to: 22,
          condition: {
            event: 'tests_passing',
            count: 10
          },
          description: 'Pass 10 test runs'
        }
      ]
    },
    {
      id: 'divsoup_chain',
      name: 'Layout Evolution',
      stages: [
        {
          monsterId: 5,
          name: 'DivSoup'
        },
        {
          monsterId: 25,
          name: 'Flexbox'
        },
        {
          monsterId: 26,
          name: 'CSSGrid'
        }
      ],
      triggers: [
        {
          from: 5,
          to: 25,
          condition: {
            event: 'refactors',
            count: 5
          },
          description: 'Perform 5 refactors'
        },
        {
          from: 25,
          to: 26,
          condition: {
            event: 'code_reviews',
            count: 5
          },
          description: 'Complete 5 code reviews'
        }
      ]
    },
    {
      id: 'merge_chain',
      name: 'Git Mastery Evolution',
      stages: [
        {
          monsterId: 8,
          name: 'MergeConflict'
        },
        {
          monsterId: 27,
          name: 'RebaseMaster'
        }
      ],
      triggers: [
        {
          from: 8,
          to: 27,
          condition: {
            event: 'conflicts_resolved',
            count: 5
          },
          description: 'Resolve 5 merge conflicts'
        }
      ]
    },
    {
      id: 'monolith_chain',
      name: 'Architecture Evolution',
      stages: [
        {
          monsterId: 13,
          name: 'Monolith'
        },
        {
          monsterId: 28,
          name: 'Microservice'
        }
      ],
      triggers: [
        {
          from: 13,
          to: 28,
          condition: {
            event: 'deploys',
            count: 5
          },
          description: 'Deploy 5 times'
        }
      ]
    },
    {
      id: 'leak_chain',
      name: 'Memory Mastery Evolution',
      stages: [
        {
          monsterId: 4,
          name: 'MemoryLeak'
        },
        {
          monsterId: 29,
          name: 'GarbageCollector'
        }
      ],
      triggers: [
        {
          from: 4,
          to: 29,
          condition: {
            event: 'ci_passes',
            count: 8
          },
          description: 'Pass 8 CI builds'
        }
      ]
    },
    {
      id: 'prompt_chain',
      name: 'AI Mastery Evolution',
      stages: [
        {
          monsterId: 17,
          name: 'PromptGoblin'
        },
        {
          monsterId: 30,
          name: 'PromptEngineer'
        }
      ],
      triggers: [
        {
          from: 17,
          to: 30,
          condition: {
            event: 'docs_written',
            count: 5
          },
          description: 'Write 5 docs'
        }
      ]
    }
  ],
  events: {
    commits: {
      label: 'Commits',
      icon: 'git-commit',
      description: 'Code committed to repository'
    },
    prs_merged: {
      label: 'PRs Merged',
      icon: 'git-merge',
      description: 'Pull requests merged'
    },
    bugs_fixed: {
      label: 'Bugs Fixed',
      icon: 'bug',
      description: 'Bug fixes committed'
    },
    tests_passing: {
      label: 'Tests Passing',
      icon: 'check',
      description: 'Test suites passed'
    },
    refactors: {
      label: 'Refactors',
      icon: 'wrench',
      description: 'Code refactored'
    },
    code_reviews: {
      label: 'Code Reviews',
      icon: 'eye',
      description: 'Pull requests reviewed'
    },
    conflicts_resolved: {
      label: 'Conflicts Resolved',
      icon: 'git-branch',
      description: 'Merge conflicts resolved'
    },
    ci_passes: {
      label: 'CI Passes',
      icon: 'server',
      description: 'CI pipeline passed'
    },
    deploys: {
      label: 'Deploys',
      icon: 'rocket',
      description: 'Code deployed'
    },
    docs_written: {
      label: 'Docs Written',
      icon: 'book',
      description: 'Documentation added'
    },
    lint_fixes: {
      label: 'Lint Fixes',
      icon: 'check-circle',
      description: 'Lint issues resolved'
    },
    type_errors_fixed: {
      label: 'Type Errors Fixed',
      icon: 'shield',
      description: 'TypeScript errors resolved'
    },
    security_fixes: {
      label: 'Security Fixes',
      icon: 'lock',
      description: 'Security issues resolved'
    }
  }
};
