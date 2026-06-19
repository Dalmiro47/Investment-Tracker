## Claude Code YOLO
claude --dangerously-skip-permissions 

## Pull Request to Github 
git switch -c chore/brain-sync-skill-gate-no-skills-clause

## Do ALL THE CHANGES 

## Pull Request to Github 
git add -A 
git commit -m "chore(brain-sync): handle no-skills-yet case in Step 0c gate" 
git push -u origin chore/brain-sync-skill-gate-no-skills-clause

## Make local main match GitHub

git switch main 
git fetch origin 
git reset --hard origin/main 
 

## Verify: 

git rev-parse HEAD 
git rev-parse origin/main 
 
## After merge, delete the branch
git branch -D chore/brain-sync-skill-gate-no-skills-clause
 