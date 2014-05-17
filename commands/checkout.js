define(['commands/object2file', 'commands/conditions', 'utils/file_utils', 'utils/errors'], function(object2file, Conditions, fileutils, errutils){
    
    var blowAwayWorkingDir = function(dir, success, error){
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

    var checkout = function(options, success, error){
        var dir = options.dir,
            store = options.objectStore,
            ref = options.ref || (options.branch ? ('refs/heads/'+options.branch) : undefined),
            sha = options.sha,
            ferror = errutils.fileErrorFunc(error);
        
        function _doCheckout(branchSha) {
            store.getHeadSha(function(currentSha){
                if (currentSha != branchSha){
                    Conditions.checkForUncommittedChanges(dir, store, function(config){
                        blowAwayWorkingDir(dir, function(){
                            store._retrieveObject(branchSha, "Commit", function(commit){
                                var treeSha = commit.tree;
                                object2file.expandTree(dir, store, treeSha, function(dircache){
                                    console.log("got back dircache",dircache)
                                    try {
                                        var dirCacheArrayBuffer = dircache.getBinFormat();
                                        if (sha) {
                                            store.setDetachedHead(sha, function() {
                                                store.updateLastChange(null, success);
                                                console.log("write dircache detached")
                                                store.writeDircache(dirCacheArrayBuffer, success, error);
                                            });
                                        } else if (ref) {
                                            store.setHeadRef(ref, function(){
                                                store.updateLastChange(null, success);
                                                console.log("write dircache ref")
                                                store.writeDircache(dirCacheArrayBuffer, success, error);
                                            });
                                        }
                                    } catch(e) {
                                        console.error("Err:", e.stack);
                                    } 
                                });
                             });
                        }, ferror);
                    }, error);
                }
                else { // already have the sha checkouted out, so just update HEAD ref if needed
                    store.getHeadRef(function(HEAD) {
                        if (ref && (HEAD != ref)) {
                            console.log("updating HEAD to ref:"+ref);
                            store.setHeadRef(ref, success);    
                        } else if (sha && (HEAD != sha)) {
                            console.log("updating HEAD to SHA:"+sha);
                            store.setHeadRef(sha, success);
                        } else {
                            console.log("HEAD already:"+(ref || sha));
                            setTimeout(success);
                        }
                    });
                }
            });
        }
        if (!ref && !sha) {
            error("MISSING Ref or Sha, Cannot Checkout");
            return;
        }
        
        if (sha) { // already have the commit sha we need to checkout
            setTimeout(function() {_doCheckout(sha);});
        } else { // look up the commit sha poitned to by this ref
            store._getHeadForRef(ref, _doCheckout, function(e){
                console.error("checkout got error", e);
                if (e.code == FileError.NOT_FOUND_ERR){
                    error({type: errutils.CHECKOUT_BRANCH_NO_EXISTS, msg: errutils.CHECKOUT_BRANCH_NO_EXISTS_MSG});
                }
                else{
                    ferror(e);
                }
            });
        }
    }
    return checkout;
})