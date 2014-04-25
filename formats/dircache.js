define(['utils/misc_utils'], function(miscUtils) {
    var HEADER_VER_OFFSET = 4;
    var HEADER_ENTRIES_COUNT_OFFSET = HEADER_VER_OFFSET + 4;
    var FIRST_ENTRY_OFFSET = HEADER_ENTRIES_COUNT_OFFSET + 4;
    var ENTRY_OFFSET_TO_SHA = 4 * 10; //10 32bit fields
    
    // This object parses the data contained in the git dircache, aka .git/index file
    var Dircache = function(buf) {
    	var data = new DataView(buf);
        var uv8 = new Uint8Array(buf);
    	this.data = data;
    	// read in the header
        
        //check magic number...
        if ("DIRC" !== getASCIIChars(data, 4)) {
            console.error("INVALID Dircache file");
            throw new Error("INVALID Dircache file");
        }
    	var versionNum = data.getUint32(HEADER_VER_OFFSET);
        var entriesCount = data.getUint32(HEADER_ENTRIES_COUNT_OFFSET);
        console.log("Dircache ver:"+versionNum+" entries:"+entriesCount);
        
        var FIRST_ENTRY_OFFSET = 12;
        var entries = {};
        var nextOffset = FIRST_ENTRY_OFFSET;
        var entry = {};
        for (var i=0; i < entriesCount; i++) {
            nextOffset = readEntry(data, uv8, nextOffset, entry);
            entries[entry.path] = entry;
            entry = {};
        }
        console.log("read entries", entries);
    };
        

    function compareShas(sha1, sha2){
         // assume the first byte has been matched in the fan out table
        for (var i = 1; i < 20; i++){
            if (sha1[i] != sha2[i]){
                return sha1[i] - sha2[i];
            }
        }
        return 0;
    }
    
    function getShaAtIndex(uv8, byteOffset){
        return uv8.subarray(byteOffset, byteOffset + 20); 
    }
    
    /**
     * @return string, each byte being read out as 1 char
     */
    function getASCIIChars(dataView, count) {
        var str = "";
        for (var i=0; i < count; i++) {
            str += String.fromCharCode(dataView.getUint8(i));
        }
        return str;
    }
    
    /**
     * @return Number, the number of bytes past offset that have a null followed by non-null byte
     */
    function findLastNull(dataView, offset) {
        var currByte = dataView.getUint8(offset), prevByte, count = 0;
        do {
            prevByte = currByte;
            currByte = dataView.getUint8(offset+(++count));
        } while (!((currByte != 0) && (prevByte === 0)));
        return count;
    }
    
    function trimTrailingNulls(buf) {
        var i=0;
        do{
            b = buf[i++];
        }while ((b != 0) && (buf.length > i))
        return  buf.subarray(0, i-1);
    }
    
    /**
     * will populate the passed in entry object with props for the reaad entry, props are:
     * sha (String), path (String), modTime (Date), size (Number)
     * returns the new offset
     */
    function readEntry (dataView, uint8Arr, offset, entry) {
        var FILE_SIZE_OFFSET = offset + (4 * 9); //10th 32bit field
        var SHA_OFFSET = FILE_SIZE_OFFSET + 4;
        var FLAGS_V2_OFFSET = SHA_OFFSET + 20; //160 bits for sha1 
        var PATH_OFFSET = SHA_OFFSET + 20 + 2; //16bits for flags field in v2

        var ctime = dataView.getUint32(offset);
        var mtime = dataView.getUint32(offset+8);
        var time = ctime > mtime ? ctime : mtime;
        entry.modTime = new Date(time * 1000);
        entry.size = dataView.getUint32(FILE_SIZE_OFFSET);
        entry.sha = miscUtils.convertBytesToSha(getShaAtIndex(uint8Arr, SHA_OFFSET));
        var nextEntryOffset = findLastNull(dataView, PATH_OFFSET);
        entry.path = miscUtils.bytesToString(trimTrailingNulls(uint8Arr.subarray(PATH_OFFSET,PATH_OFFSET+nextEntryOffset)));
        return PATH_OFFSET + nextEntryOffset;
    }
    return Dircache;
});