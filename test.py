import urllib.request, re
html = urllib.request.urlopen('https://www.mindteck.com/').read().decode('utf-8')
imgs = re.findall(r'<img[^>]+src="([^"]+)"', html)
print([img for img in imgs if 'logo' in img.lower()][:5])
