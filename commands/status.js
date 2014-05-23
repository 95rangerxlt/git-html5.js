define(['utils/file_utils', 'utils/errors', 'utils/misc_utils', 'formats/dircache'], function(fileutils, errutils, miscUtils,  Dircache){
"use strict";

    var status = {
        compareWorkDirToDircache : function(dir, store, callback, error) {
            var lastUpdate;
            var dcache;
            
            var walkDir = function(dir, callback){
                dir.getMetadata(function(md){
                   fileutils.ls(dir, function(entries){
                        var changed;
                        var result = [];
                        miscUtils.asyncForEach(entries, function(entry, done){
                            if (entry.isDirectory){
                                if (entry.name == '.git'){
                                    done();
                                    return;
                                }
                                entry.getMetadata(function(md){
                                    walkDir(entry, function(){
                                        done();
                                    });
                                }, done);
                            }
                            else{
                                entry.getMetadata(function(md){
                                    try {
                                        var path = miscUtils.stripParentDir(entry.fullPath);
                                        var cacheEntry = dcache.getEntry(path);
                                        //console.log("check modtime for:", path, md.modificationTime);
                                        if (!cacheEntry) {
                                           // console.log("found not dircache file:"+path);
                                            result.push(entry);
                                        } else if ((md.modificationTime.getTime()) > cacheEntry.modTime.getTime()){
                                            //console.log("found dirty:"+path, md.modificationTime.getTime() +"::"+cacheEntry.modTime.getTime());
                                            result.push(entry);
                                        }
                                    } catch(e) {
                                        console.error(e);
                                    }
                                    done();
                                }, error);                                
                            }
                        }, function(){
                            callback(result);
                        });
                    });
                });
            };

            store.getDircache(function(dcArraybuffer){                
                dcache = new Dircache(dcArraybuffer);
                walkDir(dir, callback); //callback will be passed an Array with any new/modified FileEntry objects
            });
        }
    };
    return status;
});