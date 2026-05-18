## Claude Code YOLO
claude --dangerously-skip-permissions 

## Pull Request to Github 
git switch -c fix/futures-positions

## Do ALL THE CHANGES 

## Pull Request to Github 
git add -A 
git commit -m "fix: Bug - futures positions table hid older closed sessions" 
git push -u origin fix/futures-positions

## Make local main match GitHub

git switch main 
git fetch origin 
git reset --hard origin/main 
 

## Verify: 

git rev-parse HEAD 
git rev-parse origin/main 
 
## After merge, delete the branch
git branch -D fix/futures-positions
 