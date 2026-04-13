## Claude Code YOLO
claude --dangerously-skip-permissions 

## Pull Request to Github 
git switch -c ref/delete-etf-plan 

## Do ALL THE CHANGES 

## Pull Request to Github 
git add -A 
git commit -m "feat: repo updated with new injections/wiki" 
git push -u origin ref/delete-etf-plan 

## Make local main match GitHub

git switch main 
git fetch origin 
git reset --hard origin/main 
 

## Verify: 

git rev-parse HEAD 
git rev-parse origin/main 
 
## After merge, delete the branch
git branch -D ref/delete-etf-plan 
 

 
