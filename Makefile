.PHONY: build check test serve clean

PYTHON ?= python
PORT ?= 8000

build:
	$(PYTHON) scripts/build_data.py

check:
	$(PYTHON) scripts/build_data.py --check
	$(PYTHON) -m unittest discover -s tests -v
	node --check site/assets/app.js

test:
	$(PYTHON) -m unittest discover -s tests -v

serve: build
	$(PYTHON) -m http.server $(PORT) --directory site

clean:
	rm -f site/data/projects.json
