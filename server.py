from http.server import SimpleHTTPRequestHandler, HTTPServer

class CORSHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        print("Headers sent")
        return super().end_headers()

httpd = HTTPServer(('localhost', 3000), CORSHTTPRequestHandler)
print("Serving on http://localhost:3000")
httpd.serve_forever()