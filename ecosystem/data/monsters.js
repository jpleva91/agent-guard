// Monster data — inlined from monsters.json (descriptions stripped for size)
// To regenerate: node scripts/sync-data.js
export const MONSTERS = [
  {
    id: 1,
    name: 'NullPointer',
    type: 'backend',
    hp: 30,
    attack: 8,
    defense: 4,
    speed: 6,
    moves: [
      'segfault',
      'unhandledexception',
      'memoryaccess'
    ],
    color: '#e74c3c',
    sprite: 'nullpointer',
    rarity: 'common',
    theme: 'runtime error',
    evolution: 'OptionalChaining',
    evolvesTo: 21,
    passive: null,
    errorPatterns: [
      'TypeError: Cannot read propert',
      'TypeError: Cannot access',
      'Cannot read properties of null',
      'Cannot read properties of undefined',
      'undefined is not an object',
      'null is not an object'
    ],
    fixTip: 'Check if the object exists before accessing its properties. Use optional chaining (?.) or a null check.'
  },
  {
    id: 2,
    name: 'CallbackHell',
    type: 'backend',
    hp: 27,
    attack: 9,
    defense: 3,
    speed: 8,
    moves: [
      'recursiveloop',
      'stackoverflowmove',
      'eventstorm'
    ],
    color: '#c0392b',
    sprite: 'callbackhell',
    rarity: 'common',
    theme: 'nested async chaos',
    evolution: 'PromiseChain',
    finalEvolution: 'AsyncAwait',
    evolvesTo: 23,
    passive: null,
    errorPatterns: [
      'is not a function',
      'callback',
      'undefined is not a function'
    ],
    fixTip: 'Refactor nested callbacks to async/await. Check that callback arguments are functions, not undefined.'
  },
  {
    id: 3,
    name: 'RaceCondition',
    type: 'backend',
    hp: 25,
    attack: 6,
    defense: 3,
    speed: 10,
    moves: [
      'threadcollision',
      'deadlockmove',
      'datacorruption'
    ],
    color: '#f39c12',
    sprite: 'racecondition',
    rarity: 'uncommon',
    theme: 'concurrency bug',
    evolution: null,
    passive: {
      name: 'NonDeterministic',
      description: 'Randomly acts twice per turn'
    },
    errorPatterns: [
      'race condition',
      'concurrent',
      'data race',
      'ECONNRESET'
    ],
    fixTip: 'Ensure shared state is accessed sequentially. Use locks, mutexes, or serialize async operations.'
  },
  {
    id: 4,
    name: 'MemoryLeak',
    type: 'backend',
    hp: 45,
    attack: 5,
    defense: 7,
    speed: 2,
    moves: [
      'heapoverflow',
      'garbagestorm',
      'referencetrap'
    ],
    color: '#2ecc71',
    sprite: 'memoryleak',
    rarity: 'common',
    theme: 'resource exhaustion',
    evolution: 'GarbageCollector',
    evolvesTo: 29,
    passive: null,
    errorPatterns: [
      'heap out of memory',
      'out of memory',
      'ENOMEM',
      'allocation failed',
      'memory leak'
    ],
    fixTip: 'Look for growing arrays, unclosed event listeners, or circular references preventing garbage collection.'
  },
  {
    id: 5,
    name: 'DivSoup',
    type: 'frontend',
    hp: 28,
    attack: 6,
    defense: 5,
    speed: 7,
    moves: [
      'layoutshift',
      'zindexwar',
      'margincollapse'
    ],
    color: '#3498db',
    sprite: 'divsoup',
    rarity: 'common',
    theme: 'messy HTML layout',
    evolution: 'Flexbox',
    finalEvolution: 'CSSGrid',
    evolvesTo: 25,
    passive: null,
    errorPatterns: [
      'DOM',
      'innerHTML',
      'querySelector returned null',
      'document is not defined'
    ],
    fixTip: 'Check that the DOM element exists before manipulating it. Ensure code runs after DOMContentLoaded.'
  },
  {
    id: 6,
    name: 'SpinnerOfDoom',
    type: 'frontend',
    hp: 35,
    attack: 7,
    defense: 6,
    speed: 3,
    moves: [
      'loadingloop',
      'timeout',
      'retryrequest'
    ],
    color: '#2980b9',
    sprite: 'spinnerofdoom',
    rarity: 'common',
    theme: 'infinite loading spinner',
    evolution: null,
    passive: null,
    errorPatterns: [
      'ETIMEDOUT',
      'timeout',
      'timed out',
      'ESOCKETTIMEDOUT',
      'request timeout'
    ],
    fixTip: 'The operation took too long. Check network connectivity, increase timeout limits, or add retry logic.'
  },
  {
    id: 7,
    name: 'StateHydra',
    type: 'frontend',
    hp: 32,
    attack: 9,
    defense: 4,
    speed: 5,
    moves: [
      'reduxstorm',
      'contextexplosion',
      'statemutation'
    ],
    color: '#1abc9c',
    sprite: 'statehydra',
    rarity: 'uncommon',
    theme: 'complex state management',
    evolution: null,
    passive: null,
    errorPatterns: [
      'state',
      'Maximum update depth exceeded',
      'Cannot update during an existing state transition',
      'infinite loop'
    ],
    fixTip: 'Check for state updates in render/effect loops. Ensure setState is not called unconditionally in useEffect or componentDidUpdate.'
  },
  {
    id: 8,
    name: 'MergeConflict',
    type: 'devops',
    hp: 32,
    attack: 6,
    defense: 7,
    speed: 4,
    moves: [
      'conflictmarkers',
      'forcepush',
      'hotfix'
    ],
    color: '#e67e22',
    sprite: 'mergeconflict',
    rarity: 'common',
    theme: 'git chaos',
    evolution: 'RebaseMaster',
    evolvesTo: 27,
    passive: null,
    errorPatterns: [
      'SyntaxError: Unexpected token',
      'SyntaxError: Unexpected identifier',
      'SyntaxError: Missing',
      'Parsing error',
      'Unexpected end of input'
    ],
    fixTip: 'Check for typos, missing brackets, or unclosed strings near the reported line. Look for merge conflict markers (<<<<<<<).'
  },
  {
    id: 9,
    name: 'CIPhantom',
    type: 'devops',
    hp: 26,
    attack: 8,
    defense: 3,
    speed: 9,
    moves: [
      'flakytestmove',
      'pipelinecrash',
      'dependencymismatch'
    ],
    color: '#d35400',
    sprite: 'ciphantom',
    rarity: 'uncommon',
    theme: 'failing CI pipeline',
    evolution: null,
    passive: null,
    errorPatterns: [
      'ENOENT',
      'no such file',
      'does not exist',
      'Cannot find module',
      'ERR_MODULE_NOT_FOUND',
      'MODULE_NOT_FOUND'
    ],
    fixTip: 'The file or module does not exist. Check the path for typos, verify it was created, or run npm install.'
  },
  {
    id: 10,
    name: 'DockerDaemon',
    type: 'devops',
    hp: 38,
    attack: 7,
    defense: 6,
    speed: 4,
    moves: [
      'containerspawn',
      'hotfix',
      'portbinding'
    ],
    color: '#f39c12',
    sprite: 'dockerdaemon',
    rarity: 'common',
    theme: 'container chaos',
    evolution: null,
    passive: null,
    errorPatterns: [
      'EADDRINUSE',
      'port',
      'docker',
      'container',
      'bind'
    ],
    fixTip: 'The port is already in use. Kill the existing process or use a different port.'
  },
  {
    id: 11,
    name: 'FlakyTest',
    type: 'testing',
    hp: 24,
    attack: 7,
    defense: 4,
    speed: 8,
    moves: [
      'randomfail',
      'timingissue',
      'mockbreak'
    ],
    color: '#27ae60',
    sprite: 'flakytest',
    rarity: 'common',
    theme: 'nondeterministic failures',
    evolution: null,
    passive: {
      name: 'RandomFailure',
      description: '50% chance to ignore damage'
    },
    errorPatterns: [
      'flaky',
      'intermittent',
      'sometimes',
      'nondeterministic'
    ],
    fixTip: 'This test is flaky. Look for timing dependencies, shared state between tests, or race conditions in async tests.'
  },
  {
    id: 12,
    name: 'AssertionError',
    type: 'testing',
    hp: 30,
    attack: 8,
    defense: 5,
    speed: 6,
    moves: [
      'expectedmismatch',
      'edgecase',
      'strictmode'
    ],
    color: '#2ecc71',
    sprite: 'assertionerror',
    rarity: 'common',
    theme: 'failed expectations',
    evolution: null,
    passive: null,
    errorPatterns: [
      'AssertionError',
      'Assertion',
      'assert',
      'expected',
      'toBe',
      'toEqual',
      'not equal'
    ],
    fixTip: 'The assertion failed because actual !== expected. Check the test expectations and the code under test.'
  },
  {
    id: 13,
    name: 'Monolith',
    type: 'architecture',
    hp: 50,
    attack: 6,
    defense: 9,
    speed: 1,
    moves: [
      'couplingstrike',
      'dependencyweb',
      'refactorresist',
      'ctrlz'
    ],
    color: '#8e44ad',
    sprite: 'monolith',
    rarity: 'uncommon',
    theme: 'massive legacy system',
    evolution: 'Microservice',
    evolvesTo: 28,
    passive: null,
    errorPatterns: [
      'circular dependency',
      'circular require',
      'ERR_REQUIRE_CYCLE'
    ],
    fixTip: 'Break circular dependencies by extracting shared code into a separate module.'
  },
  {
    id: 14,
    name: 'CleanArchitecture',
    type: 'architecture',
    hp: 28,
    attack: 7,
    defense: 7,
    speed: 6,
    moves: [
      'dependencyrule',
      'interfacesegregation',
      'abstractionshield',
      'ctrlz'
    ],
    color: '#9b59b6',
    sprite: 'cleanarchitecture',
    rarity: 'uncommon',
    theme: 'layered architecture purity',
    evolution: null,
    passive: null,
    errorPatterns: [
      'SOLID',
      'dependency inversion',
      'interface segregation'
    ],
    fixTip: 'Consider applying SOLID principles. Extract interfaces and invert dependencies.'
  },
  {
    id: 15,
    name: 'SQLInjector',
    type: 'security',
    hp: 26,
    attack: 10,
    defense: 3,
    speed: 7,
    moves: [
      'tabledrop',
      'queryescape',
      'privilegeescalation'
    ],
    color: '#e94560',
    sprite: 'sqlinjector',
    rarity: 'uncommon',
    theme: 'injection attacks',
    evolution: null,
    passive: null,
    errorPatterns: [
      'SQL',
      'injection',
      'query',
      'SQLITE',
      'ER_PARSE_ERROR'
    ],
    fixTip: 'Use parameterized queries instead of string concatenation. Never trust user input in SQL.'
  },
  {
    id: 16,
    name: 'XSSpecter',
    type: 'security',
    hp: 25,
    attack: 9,
    defense: 3,
    speed: 9,
    moves: [
      'scriptinjection',
      'domhijack',
      'cookietheft'
    ],
    color: '#c0392b',
    sprite: 'xsspecter',
    rarity: 'uncommon',
    theme: 'cross-site scripting',
    evolution: null,
    passive: null,
    errorPatterns: [
      'XSS',
      'script',
      'Content-Security-Policy',
      'unsafe-inline'
    ],
    fixTip: 'Sanitize user input before inserting into the DOM. Use Content-Security-Policy headers.'
  },
  {
    id: 17,
    name: 'PromptGoblin',
    type: 'ai',
    hp: 27,
    attack: 8,
    defense: 4,
    speed: 8,
    moves: [
      'promptinjection',
      'contextflood',
      'tokenoverflow'
    ],
    color: '#00d2ff',
    sprite: 'promptgoblin',
    rarity: 'uncommon',
    theme: 'prompt engineering chaos',
    evolution: 'PromptEngineer',
    evolvesTo: 30,
    passive: null,
    errorPatterns: [
      'prompt',
      'token',
      'context length',
      'context window'
    ],
    fixTip: 'The prompt is too long or malformed. Reduce context size or restructure the prompt.'
  },
  {
    id: 18,
    name: 'HalluciBot',
    type: 'ai',
    hp: 30,
    attack: 7,
    defense: 5,
    speed: 7,
    moves: [
      'confidentanswer',
      'fabricatedcitation',
      'creativeguess'
    ],
    color: '#00b4d8',
    sprite: 'hallucibot',
    rarity: 'common',
    theme: 'hallucinating model',
    evolution: null,
    passive: null,
    errorPatterns: [
      'hallucin',
      'incorrect',
      'fabricat',
      'confident'
    ],
    fixTip: 'Verify AI-generated output against trusted sources. Add fact-checking and citation requirements.'
  },
  {
    id: 19,
    name: 'TheSingularity',
    type: 'ai',
    hp: 55,
    attack: 10,
    defense: 8,
    speed: 8,
    moves: [
      'recursiveselfimprove',
      'computeoverload',
      'alignmenttest'
    ],
    color: '#ff006e',
    sprite: 'thesingularity',
    rarity: 'legendary',
    theme: 'runaway intelligence',
    evolution: null,
    passive: null,
    errorPatterns: [
      'RangeError: Maximum call stack',
      'stack overflow',
      'too much recursion',
      'recursion'
    ],
    fixTip: 'Your recursion has no exit. Add a base case or convert to an iterative approach.'
  },
  {
    id: 20,
    name: 'TheLegacySystem',
    type: 'architecture',
    hp: 60,
    attack: 7,
    defense: 10,
    speed: 1,
    moves: [
      'untouchablemodule',
      'tribalknowledge',
      'refactorcurse'
    ],
    color: '#6c3483',
    sprite: 'thelegacysystem',
    rarity: 'legendary',
    theme: 'ancient unstoppable codebase',
    evolution: null,
    passive: null,
    errorPatterns: [
      'DEPRECAT',
      'deprecated',
      'legacy',
      'EOL',
      'end of life'
    ],
    fixTip: 'This code uses deprecated APIs. Check the docs for modern replacements.'
  },
  {
    id: 21,
    name: 'OptionalChaining',
    type: 'backend',
    hp: 38,
    attack: 9,
    defense: 6,
    speed: 8,
    moves: [
      'segfault',
      'memoryaccess',
      'safeaccess'
    ],
    color: '#e67e22',
    sprite: 'optionalchaining',
    rarity: 'evolved',
    theme: 'safe property access',
    evolution: 'TypeSafety',
    evolvesTo: 22,
    evolvedFrom: 1,
    passive: null,
    errorPatterns: [
      'optional chaining',
      'TypeError'
    ],
    fixTip: 'Use optional chaining (?.) to safely access nested properties.'
  },
  {
    id: 22,
    name: 'TypeSafety',
    type: 'backend',
    hp: 45,
    attack: 11,
    defense: 9,
    speed: 7,
    moves: [
      'segfault',
      'safeaccess',
      'typecheck',
      'unhandledexception'
    ],
    color: '#3498db',
    sprite: 'typesafety',
    rarity: 'evolved',
    theme: 'compile-time guarantees',
    evolution: null,
    evolvedFrom: 21,
    passive: null,
    errorPatterns: [
      'type',
      'TypeScript',
      'TS2',
      'type mismatch'
    ],
    fixTip: 'The types do not match. Check your TypeScript type annotations and interfaces.'
  },
  {
    id: 23,
    name: 'PromiseChain',
    type: 'backend',
    hp: 35,
    attack: 10,
    defense: 5,
    speed: 9,
    moves: [
      'recursiveloop',
      'stackoverflowmove',
      'asyncresolve'
    ],
    color: '#2980b9',
    sprite: 'promisechain',
    rarity: 'evolved',
    theme: 'orderly async flow',
    evolution: 'AsyncAwait',
    evolvesTo: 24,
    evolvedFrom: 2,
    passive: null,
    errorPatterns: [
      'UnhandledPromiseRejection',
      'unhandled promise rejection',
      'PromiseRejection',
      'ERR_UNHANDLED_REJECTION'
    ],
    fixTip: 'Add .catch() to your promise chain, or wrap the await in a try/catch block.'
  },
  {
    id: 24,
    name: 'AsyncAwait',
    type: 'backend',
    hp: 42,
    attack: 12,
    defense: 7,
    speed: 10,
    moves: [
      'asyncresolve',
      'stackoverflowmove',
      'eventstorm',
      'recursiveloop'
    ],
    color: '#1abc9c',
    sprite: 'asyncawait',
    rarity: 'evolved',
    theme: 'transcendent async mastery',
    evolution: null,
    evolvedFrom: 23,
    passive: null,
    errorPatterns: [
      'async',
      'await',
      'promise'
    ],
    fixTip: 'Ensure async functions are properly awaited and errors are caught with try/catch.'
  },
  {
    id: 25,
    name: 'Flexbox',
    type: 'frontend',
    hp: 35,
    attack: 8,
    defense: 7,
    speed: 8,
    moves: [
      'layoutshift',
      'zindexwar',
      'flexalign'
    ],
    color: '#2471a3',
    sprite: 'flexbox',
    rarity: 'evolved',
    theme: 'flexible layout mastery',
    evolution: 'CSSGrid',
    evolvesTo: 26,
    evolvedFrom: 5,
    passive: null,
    errorPatterns: [
      'CSS',
      'layout',
      'flex',
      'rendering',
      'style'
    ],
    fixTip: 'Check your CSS for conflicting flex/grid rules. Use browser DevTools to inspect computed styles.'
  },
  {
    id: 26,
    name: 'CSSGrid',
    type: 'frontend',
    hp: 42,
    attack: 10,
    defense: 9,
    speed: 7,
    moves: [
      'layoutshift',
      'flexalign',
      'gridsnap',
      'zindexwar'
    ],
    color: '#1a5276',
    sprite: 'cssgrid',
    rarity: 'evolved',
    theme: 'two-dimensional layout mastery',
    evolution: null,
    evolvedFrom: 25,
    passive: null,
    errorPatterns: [
      'grid',
      'CSS Grid',
      'layout shift'
    ],
    fixTip: 'Check grid-template definitions. Ensure grid areas match and items are properly placed.'
  },
  {
    id: 27,
    name: 'RebaseMaster',
    type: 'devops',
    hp: 42,
    attack: 9,
    defense: 10,
    speed: 7,
    moves: [
      'forcepush',
      'conflictmarkers',
      'cleanhistory',
      'hotfix'
    ],
    color: '#d4ac0d',
    sprite: 'rebasemaster',
    rarity: 'evolved',
    theme: 'git mastery',
    evolution: null,
    evolvedFrom: 8,
    passive: null,
    errorPatterns: [
      'git',
      'rebase',
      'merge',
      'conflict'
    ],
    fixTip: 'Resolve merge conflicts by choosing the correct version. Use git diff to understand the changes.'
  },
  {
    id: 28,
    name: 'Microservice',
    type: 'architecture',
    hp: 35,
    attack: 9,
    defense: 6,
    speed: 8,
    moves: [
      'interfacesegregation',
      'abstractionshield',
      'dependencyrule',
      'servicemesh'
    ],
    color: '#7d3c98',
    sprite: 'microservice',
    rarity: 'evolved',
    theme: 'decomposed architecture',
    evolution: null,
    evolvedFrom: 13,
    passive: null,
    errorPatterns: [
      'ECONNREFUSED',
      'microservice',
      'service unavailable',
      '503',
      '502'
    ],
    fixTip: 'The service is down or unreachable. Check if it is running and the URL/port is correct.'
  },
  {
    id: 29,
    name: 'GarbageCollector',
    type: 'backend',
    hp: 50,
    attack: 7,
    defense: 10,
    speed: 5,
    moves: [
      'heapoverflow',
      'garbagestorm',
      'referencetrap',
      'memoryreclaim'
    ],
    color: '#1e8449',
    sprite: 'garbagecollector',
    rarity: 'evolved',
    theme: 'memory optimization',
    evolution: null,
    evolvedFrom: 4,
    passive: null,
    errorPatterns: [
      'garbage collect',
      'memory',
      'GC',
      'heap'
    ],
    fixTip: 'Memory is being reclaimed aggressively. Check for large allocations or weak reference issues.'
  },
  {
    id: 30,
    name: 'PromptEngineer',
    type: 'ai',
    hp: 38,
    attack: 10,
    defense: 7,
    speed: 9,
    moves: [
      'promptinjection',
      'contextflood',
      'tokenoverflow',
      'fewshotlearn'
    ],
    color: '#0096c7',
    sprite: 'promptengineer',
    rarity: 'evolved',
    theme: 'mastered prompt craft',
    evolution: null,
    evolvedFrom: 17,
    passive: null,
    errorPatterns: [
      'AI',
      'model',
      'inference',
      'API rate limit',
      '429'
    ],
    fixTip: 'The AI API returned an error. Check rate limits, API keys, and request format.'
  },
  {
    id: 31,
    name: 'TodoComment',
    type: 'testing',
    hp: 26,
    attack: 6,
    defense: 6,
    speed: 5,
    moves: [
      'techdebt',
      'timingissue',
      'edgecase'
    ],
    color: '#95a5a6',
    sprite: 'todocomment',
    rarity: 'common',
    theme: 'procrastinated fixes',
    evolution: null,
    passive: null,
    errorPatterns: [
      'TODO',
      'FIXME',
      'HACK',
      'XXX'
    ],
    fixTip: 'Stop adding TODO comments and just fix the issue. Future you will thank present you.'
  },
  {
    id: 32,
    name: 'InvariantBeast',
    type: 'testing',
    hp: 35,
    attack: 9,
    defense: 6,
    speed: 5,
    moves: [
      'invariantbreak',
      'expectedmismatch',
      'strictmode'
    ],
    color: '#e74c3c',
    sprite: 'invariantbeast',
    rarity: 'uncommon',
    theme: 'broken system invariant',
    evolution: null,
    passive: null,
    errorPatterns: [
      'invariant',
      'constraint violated',
      'postcondition failed',
      'precondition failed',
      'tests failed'
    ],
    fixTip: 'A system invariant has been violated. Check the invariant definition and ensure the system property holds true.'
  },
  {
    id: 33,
    name: 'RogueAgent',
    type: 'security',
    hp: 38,
    attack: 10,
    defense: 4,
    speed: 9,
    moves: [
      'unauthorizedexec',
      'privilegeescalation',
      'scopebreak'
    ],
    color: '#ff006e',
    sprite: 'rogueagent',
    rarity: 'uncommon',
    theme: 'unauthorized agent action',
    evolution: null,
    passive: null,
    errorPatterns: [
      'unauthorized',
      'forbidden action',
      'shell.exec',
      'scope violation',
      'permission denied'
    ],
    fixTip: 'An agent attempted an unauthorized action. Review the action scope and ensure agents operate within declared boundaries.'
  },
  {
    id: 34,
    name: 'ChaosHydra',
    type: 'architecture',
    hp: 45,
    attack: 8,
    defense: 8,
    speed: 3,
    moves: [
      'dependencyweb',
      'couplingstrike',
      'layerbreach'
    ],
    color: '#6c3483',
    sprite: 'chaoshydra',
    rarity: 'uncommon',
    theme: 'dependency cycle violation',
    evolution: null,
    passive: null,
    errorPatterns: [
      'dependency cycle',
      'circular import',
      'layer violation',
      'core depends on game',
      'architecture violation'
    ],
    fixTip: 'A dependency boundary has been crossed. Ensure modules respect the layered architecture and dependencies flow in the correct direction.'
  }
];
