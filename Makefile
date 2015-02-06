test:
	@node node_modules/lab/bin/lab -v
test-dry:
	@node node_modules/lab/bin/lab -d -v
test-cov:
	@node node_modules/lab/bin/lab -t 100 -v
test-cov-html:
	@node node_modules/lab/bin/lab -r html -o coverage.html

.PHONY: test test-cov test-cov-html
