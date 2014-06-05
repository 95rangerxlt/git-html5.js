// Remove files from the working tree

define(['utils/file_utils'], function(fileutils){
    "use strict";    
    var cleanWorkingDir = function(dir, options, success, error){
        console.log("Clean WORKING DIR!!");
        fileutils.ls(dir, function(entries){
            entries.asyncEach(function(entry, done){
                if (entry.isDirectory){
                    if (entry.name == '.git'){
                        done();
                        return;
                    }
                    else{
                        entry.removeRecursively(done, error);
                    }
                }
                else{
                    entry.remove(done, error);
                }
            }, success);
        }, error)
    }
    return cleanWorkingDir;
});