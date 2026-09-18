## Claude Code YOLO
claude --dangerously-skip-permissions 

## Pull Request to Github 
git switch -c fix/futures

## Do ALL THE CHANGES 

## Pull Request to Github 
git add -A 
git commit -m "fix: bug in future investments for P&L calculation" 
git push -u origin fix/futures

## Make local main match GitHub

git switch main 
git fetch origin 
git reset --hard origin/main 
 

## Verify: 

git rev-parse HEAD 
git rev-parse origin/main 
 
## After merge, delete the branch
git branch -D fix/futures
 

 

## To kill ports in use: 
taskkill /PID 20704 /F