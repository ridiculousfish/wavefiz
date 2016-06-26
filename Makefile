INTERMEDIATE_DIR := ./intermediates
BUILD_DIR := ./build

.PHONY: default
default: uglify

.PHONY: uglify
uglify: typescriptify | $(BUILD_DIR)
	uglifyjs --lint --screw-ie8 --output $(BUILD_DIR)/visualize.js $(INTERMEDIATE_DIR)/*.js
	
.PHONY: typescriptify
typescriptify: | $(INTERMEDIATE_DIR)
	tsc --outDir $(INTERMEDIATE_DIR) js/*.ts

$(INTERMEDIATE_DIR) $(BUILD_DIR):
	mkdir -p $@

.PHONY: clean	
clean:
	rm -rf js/*.js js/*.js.map $(INTERMEDIATE_DIR) $(BUILD_DIR)

.PHONY: deploy
deploy:
	rsync -avze ssh --include "*/" --include "*.js" --include "*.html" --include "*.css" --exclude "*" --prune-empty-dirs . ridiculousfish.com:/home/pammon/webapps/main/wavefiz

prerequisites:
	echo "npm install uglify-js -g"
