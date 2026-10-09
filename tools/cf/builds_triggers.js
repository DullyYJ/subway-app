// Cloudflare Workers Builds(Git 연결 자동 배포) 설정을 보거나 끈다.
// 사용: CF_API_TOKEN=… CF_ACCOUNT_ID=… node tools/cf/builds_triggers.js list <워커태그>
//       … node tools/cf/builds_triggers.js delete <워커태그> <트리거ID>   (트리거ID 를 직접 적어야 지워진다 — 실수 방지)
const [, , cmd, tag, trig] = process.argv;
const T = process.env.CF_API_TOKEN, A = process.env.CF_ACCOUNT_ID;
const out = [];
async function api(method, path) {
  const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + A + path, { method, headers: { authorization: 'Bearer ' + T, 'content-type': 'application/json' } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = { raw: t.slice(0, 300) }; }
  return { status: r.status, body: j };
}
(async () => {
  if (cmd === 'list') {
    const r = await api('GET', '/builds/workers/' + tag + '/triggers');
    out.push({ list: r.status, success: r.body.success, errors: r.body.errors, triggers: (r.body.result || []).map(x => ({ id: x.trigger_uuid || x.id, name: x.trigger_name, branch_includes: x.branch_includes, branch_excludes: x.branch_excludes, path_includes: x.path_includes, path_excludes: x.path_excludes, build_command: x.build_command, deploy_command: x.deploy_command, repo: x.repo_connection && (x.repo_connection.provider_account_name + '/' + x.repo_connection.repo_name), external_script_id: x.external_script_id })) });
  } else if (cmd === 'delete' && tag && trig) {
    const r = await api('DELETE', '/builds/triggers/' + trig);
    out.push({ delete: r.status, body: r.body });
    const l = await api('GET', '/builds/workers/' + tag + '/triggers');
    out.push({ after: (l.body.result || []).length });
  } else { console.error('사용법 오류'); process.exit(2); }
  require('fs').mkdirSync('out-cf', { recursive: true });
  require('fs').writeFileSync('out-cf/result.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
})();
