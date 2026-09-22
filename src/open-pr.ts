import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';
import { GitHub, Manifest } from 'release-please';

async function run(): Promise<void> {
    const token    = core.getInput('token', { required: true });
    const SRC      = core.getInput('source-branch');
    const REL      = core.getInput('release-branch');
    const CONFIG   = core.getInput('config-file');
    const MANIFEST = core.getInput('manifest-file');
    core.setSecret(token);

    const [owner, repo] = process.env.GITHUB_REPOSITORY!.split('/');
    const octokit = new Octokit({ auth: token})


    const github: GitHub = await GitHub.create({ owner, repo, token, defaultBranch: SRC });

    const manifest = await Manifest.fromManifest(github, SRC, CONFIG, MANIFEST);
    const plans = await manifest.buildPullRequests();
    const body = plans.length
        ? plans.map(p => `## ${p.title.toString()}\n\n${p.body.toString()}`).join('\n\n')
        : 'No releasable changes yet.';
    
    const existing = await octokit.pulls.list({ owner, repo, head: `${owner}:${SRC}`, base: REL, state: 'open' });
    if(existing.data.length){
        await octokit.pulls.update({ owner, repo, pull_number: existing.data[0].number, body })
    } else {
        await octokit.pulls.create({ owner, repo, head: SRC, base: REL, title: `chore(release): ${SRC} → ${REL}`, body });
    }
}

run().catch((e) => core.setFailed(e instanceof Error ? e.message : String(e)));