import * as core from '@actions/core';
import { GitHub, Manifest } from 'release-please';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Octokit } from '@octokit/rest';

function sh(cmd: string): string {
    return execSync(cmd, { encoding: 'utf8' }).trim();
}

async function run(): Promise<void>{
    const token    = core.getInput('token', { required: true });
    const REL      = core.getInput('release-branch'); // e.g. main
    const CONFIG   = core.getInput('config-file');
    const MANIFEST = core.getInput('manifest-file');
    core.setSecret(token);

    const [owner, repo] = process.env.GITHUB_REPOSITORY!.split('/');
    const github = await GitHub.create({ owner, repo, token, defaultBranch: REL });

    const manifest = await Manifest.fromManifest(github, REL, CONFIG, MANIFEST);
    const plans = await manifest.buildPullRequests();

    if(plans.length === 0){
        core.info('No releasable changes');
        core.setOutput('released', 'false');
        return
    }

    for(const plan of plans) {
        for(const u of plan.updates) {
            let current: string | undefined;
            try { current = sh(`git show HEAD:${u.path}`); } catch { current = undefined; };
            if (current === undefined && !u.createIfMissing) continue;
            mkdirSync(dirname(u.path), { recursive: true });
            writeFileSync(u.path, u.updater.updateContent(current));
        }
    }

    sh(`git config user.name release-bot`);
    sh(`git config user.email release-bot@users.noreply.github.com`);
    sh(`git add -A`);
    sh(`git commit -m "chore(release): bump versions and changelogs [skip ci]"`);
    sh(`git push origin HEAD:${REL}`);

    const created: string[] = [];
    const octokit = new Octokit({ auth: token})

    for(const plan of plans) {
        const component = plan.title.component ?? plan.labels?.[0] ?? '';
        const version = plan.version?.toString()
        if (!version) continue;

        const tag = component ? `${component}-v${version}` : `v${version}`;
        sh(`git tag "${tag}"`);
        sh(`git push origin "${tag}"`);

        await octokit.repos.createRelease({
            owner, repo, tag_name: tag, name: `${component || repo} ${version}`,
            body: plan.body.toString(),
        });
        created.push(tag);
    }

    core.setOutput('released', 'true');
    core.setOutput('tags', created.join(','));
}

run().catch((e) => core.setFailed(e instanceof Error ? e.message : String(e)));