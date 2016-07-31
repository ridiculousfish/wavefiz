INTERMEDIATE_DIR := ./intermediates
BUILD_DIR := ./build
STAGE_DIR := ./staged
VISUALIZE_JS := $(BUILD_DIR)/visualize.js
TS_SRCS := $(shell echo ts/*.ts)
JS_SRCS := $(patsubst ts/%.ts,$(INTERMEDIATE_DIR)/%.js,$(TS_SRCS))
HTML_SRCS := html/index.html html/tutorial.html
CSS := css

.PHONY: default
default: $(VISUALIZE_JS)

.PHONY: lint
lint: $(JS_SRCS)
	uglifyjs --lint --output $(VISUALIZE_JS) $^

# Hack to ensure just a single invocation of tsc
.INTERMEDIATE: hack_js.intermediate | $(INTERMEDIATE_DIR)
hack_js.intermediate: $(TS_SRCS)
	tsc --outDir $(INTERMEDIATE_DIR) $^

$(JS_SRCS): hack_js.intermediate

$(VISUALIZE_JS): $(JS_SRCS) | $(BUILD_DIR)
	uglifyjs --compress --mangle  --output $@ $^

$(INTERMEDIATE_DIR) $(BUILD_DIR):
	mkdir -p $@

prerequisites:
	echo "npm install -g typescript"
	echo "npm install uglify-js -g"

.PHONY: stage
stage: $(VISUALIZE_JS) $(HTML_SRCS)
	rm -Rf $(STAGE_DIR)
	mkdir -p $(STAGE_DIR)
	cp $(HTML_SRCS) $(STAGE_DIR)
	-test -d $(CSS) && cp -r $(CSS) $(STAGE_DIR)
	mkdir  $(STAGE_DIR)/js/
	cp $(VISUALIZE_JS) ./external_js/*.js  $(STAGE_DIR)/js/

.PHONY: deploy
deploy: stage
	rsync -avze ssh --prune-empty-dirs $(STAGE_DIR)/ ridiculousfish.com:/home/pammon/webapps/main/wavefiz

	
.PHONY: clean
clean:
	rm -rf $(INTERMEDIATE_DIR) $(BUILD_DIR) $(STAGE_DIR)
