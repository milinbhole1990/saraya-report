	var express        = require('express');
	var app            = express();
	var bodyParser     = require('body-parser');
	var methodOverride = require('method-override');
	var jsonFormat = require('json-format');
	var mysql 		   = require('mysql')
	var route          = express.Router();
	var multer = require('multer');
	var xlstojson = require("xls-to-json-lc");
	var xlsxtojson = require("xlsx-to-json-lc");
	var dateformat = require("dateformat");
	var connection     = mysql.createConnection({
		host : 'localhost',
		user : 'root',
		password : '',
		database : 'saraya_report' 
	}) 
	connection.connect(function(err) {
		if(err)
			console.log(err)
		else
			console.log('connected')
	});

	var port = process.env.PORT || 8000; 

	app.use(express.static(__dirname + '/public')); 

	app.use(bodyParser.json()); 

	app.use(bodyParser.json({ type: 'application/vnd.api+json' })); 

	app.use(bodyParser.urlencoded({ extended: true })); 

	app.use(methodOverride('X-HTTP-Method-Override')); 

	var storage = multer.diskStorage({ //multers disk storage settings
	        destination: function (req, file, cb) {
	            cb(null, './uploads/')
	        },
	        filename: function (req, file, cb) {
	            var datetimestamp = Date.now();
	            cb(null, file.fieldname + '-' + datetimestamp + '.' + file.originalname.split('.')[file.originalname.split('.').length -1])
	        }
	    });

	var upload = multer({ //multer settings
	                    storage: storage,
	                    fileFilter : function(req, file, callback) { //file filter
	                       /* if (['xls', 'xlsx','.csv'].indexOf(file.originalname.split('.')[file.originalname.split('.').length-1]) === -1) {
	                            return callback(new Error('Wrong extension type'));
	                        }*/
	                        callback(null, true);
	                    }
	  }).single('file');


	//app.use('/graphPlot', controller);
	//first page
	app.get('/',function (req,res) {
		res.sendFile(__dirname+'/public/login.html');
		console.log('login')
	});

	app.get('/inclients',function (req,res) {
		res.sendFile(__dirname+'/public/inclients.html');
		console.log('inclients')
	});


	app.post('/generateReport',function(req,res){
		
		var from = dateformat(req.body.from,'yyyy-mm-dd');
		var to = dateformat(req.body.to,'yyyy-mm-dd');
		var store_no = req.body.store_no;
		var chartType = req.body.chartType;
		var reqPara= req.body.reqPara;

		console.log("Server : "+from+ " " + to + " "+ store_no+ " "+chartType+" "+reqPara);

		var query="";

		if("inclients" == reqPara){
			query = "select DATE_FORMAT(date,'%m-%d-%Y %H:%i %p') as record_date, in_clients from tbl_client_entry_dtl where ";
			query = query+" store_no= '"+store_no+"' and ( date between "
		    query = query+" '"+from+"' and '"+to+"') ";
		} else if("outclients" == reqPara){
			query = "select DATE_FORMAT(date,'%m-%d-%Y %H:%i %p') as record_date, out_clients from tbl_client_entry_dtl where ";
			query = query+" store_no= '"+store_no+"' and ( date between "
		    query = query+" '"+from+"' and '"+to+"') ";
		} else if("multivalue" == reqPara){
			query="SELECT    DATE_FORMAT(entry.date,'%m-%d-%Y') as record_date ";
			query=query+" ,sum(entry.in_clients) as in_clients ,sum(entry.out_clients) as out_clients ";
			query=query+" ,sell_details.sale_counts FROM tbl_client_entry_dtl entry LEFT JOIN( ";
			query=query+" select date, store_no,count(pos.transaction_no) as sale_counts ";
			query=query+" from tbl_client_pos_dtl pos group by DATE_FORMAT(date,'%m-%d-%Y')) AS sell_details ";
			query=query+" ON entry.store_no=sell_details.store_no where entry.store_no='"+store_no+"' and ";
			query=query+" DATE_FORMAT(entry.date,'%m-%d-%Y')=DATE_FORMAT(sell_details.date,'%m-%d-%Y') and ";
			query=query+" ( entry.date between '"+from+"' and '"+to+"') group by DATE_FORMAT(entry.date,'%m-%d-%Y');";
		}
		
        console.log(query);
		connection.query(query, 
							function(err,rowsDtl){
								if(err){
									console.log(err)
									res.send(err) 	
								}
								else{
									console.log(rowsDtl)	
								
									res.send(rowsDtl)
								}
		})

	});

	app.post('/uploadFile', function(req, res) {
	        var exceltojson;
	        upload(req,res,function(err){

	        	var fileType= req.body.fileType;
	            if(err){
	                 res.json({error_code:1,err_desc:err});
	                 return;
	            }
	            
	            if(!req.file){
	                res.json({error_code:1,err_desc:"No file passed"});
	                return;
	            }
	            
	            if(req.file.originalname.split('.')[req.file.originalname.split('.').length-1] === 'xlsx'){
	                exceltojson = xlsxtojson;
	            } else {
	                exceltojson = xlstojson;
	            }
	            try {
	                exceltojson({
	                    input: req.file.path,
	                    output: null, //since we don't need output.json
	                    lowerCaseHeaders:true
	                }, function(err,result){
	                    if(err) {
	                        return res.json({error_code:1,err_desc:err, data: null});
	                    } 

						var values = [];
						console.log("jsondata : "+result.length);

						if("pos" == fileType){
							for(var i=0; i< result.length; i++){
							 values.push([result[i].store_no,dateformat(result[i].date,'yyyy-mm-dd'),result[i].time,result[i].transaction_no,result[i].description]);
							}
							console.log("jsondata-values: "+values);
							
							connection.query('INSERT INTO tbl_client_pos_dtl (store_no, date, time, transaction_no, description) VALUES ?', [values], function(err,result) {
							  if(err) {
							  	 console.log(err);
							     res.send('Error');
							  }
							 else {
							     res.sendFile(__dirname+'/public/file_upload.html');
							  }

							});
						} else {
							for(var i=0; i< result.length; i++){
							 values.push([result[i].store_no,dateformat(result[i].date,'yyyy-mm-dd HH:MM:ss'),result[i].in,result[i].out,result[i].remaining_people]);
							}

							console.log("jsondata : "+values);
							connection.query('INSERT INTO tbl_client_entry_dtl (store_no,date,in_clients,out_clients,remain_clients) VALUES ?', [values], function(err,result) {
							  if(err) {
							  	 console.log(err);
							     res.send('Error');
							  }
							 else {
							     res.sendFile(__dirname+'/public/file_upload.html');
							  }

							});
						}
					
	                });
	            } catch (e){
	                res.json({error_code:1,err_desc:"Corupted excel file"});
	            }
	        })
	    });

	/*

	app.get('/multiValueChart',function(req,res){
		console.log("in side testCall");
		connection.query("SELECT in_date, sum(in_clients) as in_client, sum(out_clients) as out_client, sum(number_of_sales) as number_of_sale from tbl_client_sales_dtl group by in_date", 
							function(err,rowsDtl){
								if(err){
									console.log(err)
									res.send(err) 	
								}
								else{
									console.log(rowsDtl)	
								
									res.send(rowsDtl)
								}
		})
		//res.send(rowsDtl);
	});

	app.post('/generateReport',function(req,res){
		res.send('hiiiii')
		
	});


	*/



	//(app); // configure our routes


	app.listen(port);               

	console.log('server started on port ' + port);

	exports = module.exports = app;   