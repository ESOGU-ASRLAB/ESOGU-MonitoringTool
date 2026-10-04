The source CAD STLs (`platform.stl`, `windowdoor.stl`, and
`windowlessdoor.stl`) are supplied for the north workcell. They use metres,
Z-up, and one shared coordinate frame. The two doors already meet along the
platform's length, so `WindowPlatform.js` renders them at identity transforms.
Their negative-X faces point toward the Kawasaki rail.

The browser loads the two `.optimized.stl` files. Regenerate them from the
source files with:

```sh
node scripts/ifarlab/optimize_new_usecase.mjs
```

The production build drops the two source door STLs (`postbuild` in
`client/package.json`): the app never requests them, and `windowdoor.stl`
alone is over Cloudflare Pages' 25 MiB per-file limit.
