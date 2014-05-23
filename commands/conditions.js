define(['commands/status', 'utils/errors'],function(status, errutils) {

    var conditions = {

        checkForUncommittedChanges : function(dir, store, callback, error) {            
            status.compareWorkDirToDircache(dir, store, function(changed){
                if (changed.length > 0){
                    console.error("UNCOMMITED CHANGES !!!", changed)
                    error({type: errutils.UNCOMMITTED_CHANGES, msg: errutils.UNCOMMITTED_CHANGES_MSG});
                }
                else{
                    callback();
                }
            }, error);
        }
    };
    return conditions;
});