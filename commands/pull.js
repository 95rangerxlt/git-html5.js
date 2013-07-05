define(['commands/treemerger', 'commands/object2file', 'formats/smart_http_remote', 'formats/pack_index', 'formats/pack', 'utils/file_utils', 'utils/errors'], function(treeMerger, object2file, SmartHttpRemote, PackIndex, Pack, fileutils, errutils){
    

    var _updateWorkingTree = function (dir, store, fromTree, toTree, success){
        
        var processOps = function(rootDir, ops, callback){
            ops.remove.asyncEach(function(entry, done){
                var rm = entry.isBlob ? fileutils.rmFile : fileutils.rmDir;
                rm(rootDir, entry.name, done);
            },
            function(){
                ops.add.asyncEach(function(entry, done){
                    if (!entry.isBlob){
                        fileutils.mkdirs(rootDir, entry.name, function(dirEntry){
                            object2file.expandTree(dirEntry, store, entry.sha, done);
                        });
                    }
                    else{
                        object2file.expandBlob(rootDir, store, entry.name, entry.sha, done); 
                    }
                },
                function(){
                    ops.merge.asyncEach(function(entry, done){
                        if (entry.nu.isBlob){
                            object2file.expandBlob(rootDir, store, entry.nu.name, entry.nu.sha, done); 
                        }
                        else{
                            store._retrieveObjectList([entry.old.sha, entry.nu.sha], 'Tree', function(trees){
                                var newOps = treeMerger.diffTree(trees[0], trees[1]);
                                fileutils.mkdirs(rootDir, entry.nu.name, function(dirEntry){
                                    processOps(dirEntry, newOps, done);
                                });
                            });
                        }
                    },
                    function(){
                        callback();
                    });
                });
            });
        }
        
        
        var ops = treeMerger.diffTree(fromTree, toTree);
        processOps(dir, ops, success);
    
    };

    var checkForUncommittedChanges = function(dir, objectStore, callback, error){

    };

    var pull = function(options, success, error){

        var dir = options.dir,
            store = options.objectStore,
            url = options.url,
            callback = success,
            ferror = errutils.fileErrorFunc(error);

        mkdirs = fileutils.mkdirs,
        mkfile = fileutils.mkfile,
        remote = new SmartHttpRemote(store, "origin", url, error);
        
        var nonFastForward = function(){
            error({type: errutils.PULL_NON_FAST_FORWARD, msg: errutils.PULL_NON_FAST_FORWARD_MSG});
        };

        var upToDate = function(){
            error({type: errutils.PULL_UP_TO_DATE, msg: errutils.PULL_UP_TO_DATE_MSG});
        };

        // get the current branch
        fileutils.readFile(dir, '.git/HEAD', 'Text', function(headStr){
            
            // get rid of the initial 'ref: ' plus newline at end
            var headRefName = headStr.substring(5).trim();

            remote.fetchRefs(function(refs){
                var headSha, branchRef, wantRef;
                
                refs.some(function(ref){
                    if (ref.name == headRefName){
                        branchRef = ref;
                        return true;
                    }
                });

                if (branchRef){
                     // see if we know about the branch's head commit if so, we're up to date, if not, request from remote
                    store._retrieveRawObject(branchRef.sha, 'ArrayBuffer', upToDate, function(){
                        wantRef = branchRef;
                        // Get the sha from the ref name 
                        store._getHeadForRef(branchRef.name, function(sha){
                            branchRef.localHead = sha;
                            
                            store._getCommitGraph([sha], 32, function(commits, nextLevel){
                                remote.fetchRef([wantRef], commits, nextLevel, function(objects, packData, common){
                                    // fast forward merge
                                    if (common.indexOf(wantRef.localHead) != -1){
                                        var packSha = packData.subarray(packData.length - 20);
                                        
                                        var packIdxData = PackIndex.writePackIdx(objects, packSha);
                                        
                                        // get a view of the sorted shas
                                        var sortedShas = new Uint8Array(packIdxData, 4 + 4 + (256 * 4), objects.length * 20);
                                        packNameSha = Crypto.SHA1(sortedShas);
                                        
                                        var packName = 'pack-' + packNameSha;
                                        mkdirs(store.dir, '.git/objects', function(objectsDir){
                                            store.objectsDir = objectsDir;
                                            mkfile(objectsDir, 'pack/' + packName + '.pack', packData.buffer);
                                            mkfile(objectsDir, 'pack/' + packName + '.idx', packIdxData);
                                            
                                            var packIdx = new PackIndex(packIdxData);
                                            if (!store.packs){
                                                store.packs = [];
                                            }
                                            store.packs.push({pack: new Pack(packData, store), idx: packIdx});
                                        
                                            mkfile(store.dir, '.git/' + wantRef.name, wantRef.sha, function(){
                                                store._getTreesFromCommits([wantRef.localHead, wantRef.sha], function(trees){
                                                    _updateWorkingTree(dir, store, trees[0], trees[1], success);
                                                });
                                            }); 
                                        });
                                    }
                                    else{
                                        // non-fast-forward merge
                                        nonFastForward();
                                        // var shas = [wantRef.localHead, common[i], wantRef.sha]
                                        // store._getTreesFromCommits(shas, function(trees){
                                        //     treeMerger.mergeTrees(store, trees[0], trees[1], trees[2], function(finalTree){
                                        //         mkfile(store.dir, '.git/' + wantRef.name, sha, done); 
                                        //     }, function(e){errors.push(e);done();});
                                        // });
                                        
                                    }
                                        
                                    
                                }, nonFastForward);
                            });
                                                         
                        }, ferror);
                    }); 
                }        
            });
        }, ferror);
    }
    return pull;
});