const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const requireClient = createRequire(path.resolve('client/package.json'));
const React = requireClient('react');
const { renderToStaticMarkup } = requireClient('react-dom/server');
const babel = requireClient('@babel/core');
const modules = new Map();
let fixture = {};
function load(name) {
  const filename = path.resolve('client/src/components', name + '.js');
  if (modules.has(filename)) return modules.get(filename);
  const module = { exports: {} };
  const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    presets: [requireClient.resolve('@babel/preset-react')],
    plugins: [requireClient.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (id) => id.endsWith('.css') ? {} : id.startsWith('./') ? load(id.slice(2)) : requireClient(id),
  }, { filename });
  if (name === 'robotTelemetry') module.exports.useTelemetry = () => fixture;
  modules.set(filename, module.exports);
  return module.exports;
}
const Panel = load('ControlPanel').default;
const robots = {
  ur10e: [25, -89, -3, -100, 15, -3],
  kawasaki: [40, 0, -55, 0, 65, 20],
  robot1: [15000, 400, 1794, 90, 0],
  robot2: [4500, 2600, 1757, 60, 0],
};
const props = {
  selectedRobot: 'otokar1', animate: true, showFactory: true,
  jointAngles: robots.ur10e, kawasakiAngles: robots.kawasaki,
  railPosition: 0, agvRailPosition: 0, gripperOpen: 0,
  otokarAxes: { robot1: robots.robot1, robot2: robots.robot2 },
};
const populated = Object.fromEntries(Object.entries(robots).map(([id, values]) => [id, {
  values, traces: values.map((value, axis) => Array.from({ length: 48 }, (_, index) =>
    value + (axis === 3 ? 0 : 20 * Math.sin(index / 12 + axis * 0.7)))),
}]));
const columns = [280, 262, 320].map((width) => {
  fixture = populated;
  return `<section style="width:${width}px"><h2>${width}px panel</h2>${renderToStaticMarkup(React.createElement(Panel, props))}</section>`;
});
fixture = {};
columns.push(`<section style="width:262px"><h2>Waiting for data</h2>${renderToStaticMarkup(React.createElement(Panel, { ...props, animate: false }))}</section>`);
const css = fs.readFileSync('client/src/components/ControlPanel.css', 'utf8');
fs.writeFileSync('.tmp/telemetry-preview.html', `<!doctype html><html><head><meta charset="utf-8"><style>
${css}
body { margin: 20px; background: #e9edf2; font-family: 'Segoe UI', sans-serif; display: flex; align-items:flex-start; gap:20px; }
body > section { flex: none; }
h2 { font-size:12px; color:#475569; }
.control-panel { box-sizing:border-box; height:620px; }
</style></head><body>${columns.join('')}<script>
const measurements = [...document.querySelectorAll('.control-panel')].map(panel => {
  const robots = [...panel.querySelectorAll('.telemetry-robot')];
  return {
    width: panel.getBoundingClientRect().width,
    allRobotsVisible: robots[3].getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom,
    telemetryBottom: Math.round(robots[3].getBoundingClientRect().bottom - panel.getBoundingClientRect().top),
    overflowingValues: [...panel.querySelectorAll('.telemetry-axis')].filter(el => el.scrollWidth > el.clientWidth + 1).length,
  };
});
document.body.setAttribute('data-measurements', JSON.stringify(measurements));
</script></body></html>`);
console.log('Rendered actual ControlPanel at three panel widths and with empty telemetry.');
