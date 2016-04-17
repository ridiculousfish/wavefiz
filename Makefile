build:
	tsc js/*.ts

deploy:
	rsync -avze ssh --include "*/" --include "*.js" --include "*.html" --include "*.css" --exclude "*" --prune-empty-dirs . ridiculousfish.com:/home/pammon/webapps/main/wavefiz
