define(['thirdparty/inflate.min', 'thirdparty/deflate.min'], function(){
    /* Main object */
    var utils = {
      
      // Print an error either to the console if in node, or to div#jsgit-errors
      // if in the client.
      handleError: function(message) {
        if (jsGitInNode) {
          console.log(message)
        }
        else {
          $('#jsgit-errors').append(message)
        }
      },
      
      // Turn an array of bytes into a String
      bytesToString: function(bytes) {
        var result = "";
        var i;
        for (i = 0; i < bytes.length; i++) {
          result = result.concat(String.fromCharCode(bytes[i]));
        }
        return result;
      },
      
      stringToBytes: function(string) {
        var bytes = []; 
        var i; 
        for(i = 0; i < string.length; i++) {
          bytes.push(string.charCodeAt(i) & 0xff);
        }
        return bytes;
      },
        
      toBinaryString: function(binary) {
        if (Array.isArray(binary)) {
          return Git.bytesToString(binary)
        }
        else {
          return binary
        }
      },
        
      // returns the next pkt-line
      nextPktLine: function(data) {
        var length = parseInt(data.substring(0, 4), 16);
        return data.substring(4, length);
      },
      
      // zlib files contain a two byte header. (RFC 1950)
      stripZlibHeader: function(zlib) {
        return zlib.subarray(2)
      },
      
      escapeHTML: function(s) {
        return s
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      },
        convertShaToBytes: function(sha){
            var bytes = new Uint8Array(sha.length/2);
            for (var i = 0; i < sha.length; i+=2)
            {
                bytes[i/2] = parseInt('0x' + sha.substr(i, 2));
            }
            return bytes;   
        },
        convertBytesToSha : function(bytes){
            var shaChars = [];
            for (var i = 0; i < bytes.length; i++){
                var next = (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
                shaChars.push(next);
            }
            return shaChars.join('');
        },
        compareShas : function(sha1, sha2){
            for (var i = 1; i < 20; i++){
                if (sha1[i] != sha2[i]){
                    return sha1[i] - sha2[i];
                }
            }
            return 0;
        },
        inflate: function(data, expectedLength){
            var options;
            if (expectedLength){
              options = {bufferSize: expectedLength};
            } 
            var inflate = new Zlib.Inflate(data, options);
            inflate.verify = true;
            var out = inflate.decompress();
            out.compressedLength = inflate.ip;
            return out;
        },
        deflate: function(data){
            var deflate = new Zlib.Deflate(data);
            var out = deflate.compress();
            return out;
        },
        trimBuffer: function(data){
            var buffer = data.buffer;
            if (data.byteOffset != 0 || data.byteLength != data.buffer.byteLength){
                buffer = data.buffer.slice(data.byteOffset, data.byteLength + data.byteOffset);
            }
            return buffer;
        },
        //shallow concat - adds all B props to A
        concatObjects: function(A, B) {
            var key;
            for (key in B) {
                if (B.hasOwnProperty(key)) {
                    A[key] = B[key];
                }
            }
        },
        // dir is a String of a file system path, will return it with the parent dir in the path removed
        // will also handle any leading forward slash
        stripParentDir: function(path) {
            var delim = path.substring(1).indexOf("/"); //substring to skip leading "/"
            return (delim > 0) ? path.substring(delim+2) : ""; //skip top-level work dir in path
        },
        // call fn for each item in array, calling callback when done
        // courtesy of http://zef.me/3420/async-foreach-in-javascript
        asyncForEach: function(array, fn, callback) {
            array = array.slice(0);
            function processOne() {
                var item = array.pop();
                fn(item, function(result) {
                    if(array.length > 0) {
                        processOne();
                    } else {
                        callback(); // Done!
                    }
                });
            }
            if(array.length > 0) {
                processOne(); // schedule immediately
            } else {
                callback(); // Done!
            }
        }
    }

    return utils;

});