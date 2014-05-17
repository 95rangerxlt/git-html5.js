define(['utils/file_utils', 'formats/dircache'], function(fileutils, Dircache){

    var dc = new Dircache();

    var expandBlob = function(dir, store, name, blobSha, callback){
        var makeFileFactory = function(name){
            return function(blob){
                var delim = dir.fullPath.substring(1).indexOf("/"); //substring to skip leading "/"
                var dirPath = (delim > 0) ? dir.fullPath.substring(delim+2)+"/" : ""; //skip top-level work dir in path
                dc.addEntry(dirPath + name, blobSha, new Date(), blob.data.byteLength);                
                fileutils.mkfile(dir, name, blob.data, callback, function(e){console.log(e)});
            }
        }
        store._retrieveObject(blobSha, "Blob", makeFileFactory(name));
    }

    var expandTree = function(dir, store, treeSha, callback){
        
        store._retrieveObject(treeSha, "Tree", function(tree){
            var entries = tree.entries;
            entries.asyncEach( function(entry, done){
                if (entry.isBlob){
                    var name = entry.name;
                    expandBlob(dir, store, name, entry.sha, done);                    
                }
                else{
                    var sha = entry.sha;
                    fileutils.mkdirs(dir, entry.name, function(newDir){
                        if (entry.isSubmodule) {
                            setTimeout(done, 0); //submodule dir never has contents
                        } else {
                            expandTree(newDir, store, sha, done);
                        }
                    }, function(x) { console.error("mkdir error ", x); });
                }
            }, function() { callback(dc); } );
        });
    }

    return {
        expandTree : expandTree,
        expandBlob : expandBlob
    }

});