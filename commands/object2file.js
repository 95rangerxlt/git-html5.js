define(['utils/file_utils', 'utils/misc_utils', 'formats/dircache'], function(fileutils, miscUtils, Dircache){

    var DIRCACHE_SUBMODULE_BYTE_SIZE = 4096;
    var dc = new Dircache();

    var addToDircache = function(dir, name, sha, modTime, size) {
        var relativePath = miscUtils.stripParentDir(dir.fullPath);
        dc.addEntry(((relativePath != "") ? relativePath+"/" : "") + name, sha, modTime, size);
    };

    var expandBlob = function(dir, store, name, blobSha, callback){
        var makeFileFactory = function(name){
            return function(blob){
                fileutils.mkfile(dir, name, blob.data, function(fileEntry) {
                    entry.getMetadata(function(md){
                        addToDircache(dir, name, blobSha, md.modificationTime, md.size);    
                        callback();    
                    }, function(e) { console.error(e); callback();});
                },
                function(e){console.log(e); callback();});
            };
        };
        store._retrieveObject(blobSha, "Blob", makeFileFactory(name));
    };

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
                        try {
                            if (entry.isSubmodule) {
                                addToDircache(dir, entry.name, sha, new Date(), DIRCACHE_SUBMODULE_BYTE_SIZE);
                                done(); //submodule dir never has contents
                            } else {
                                expandTree(newDir, store, sha, done);
                            }
                        } catch(e) { console.error(e.stack); }
                    }, function(x) { console.error("mkdir error ", x); });
                }
            }, function() { callback(dc); });
        });
    };

    return {
        expandTree : expandTree,
        expandBlob : expandBlob
    };

});