define(['formats/smart_http_remote'], function(SmartHttpRemote){
    
    /**
     * returns an Array of Objects, each with a "name" and "sha" property
     * the names are direct from the remote, so eg. "refs/heads/foo"
     */
    var lsremote = function(options, success, error){
        
        var url = options.url,
            store = options.store,
            username = options.username,
            password = options.password,
            remote = new SmartHttpRemote(store, "origin", url, username, password, error);
        
        console.log("fetching remotes..");
        remote.fetchRefs(function(refs){
            success(refs);
        });
    }
    
    return lsremote;
});